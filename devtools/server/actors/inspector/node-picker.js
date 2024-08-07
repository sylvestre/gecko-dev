/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

loader.lazyRequireGetter(
  this,
  "isRemoteBrowserElement",
  "resource://devtools/shared/layout/utils.js",
  true
);
loader.lazyRequireGetter(
  this,
  "HighlighterEnvironment",
  "resource://devtools/server/actors/highlighters.js",
  true
);
loader.lazyRequireGetter(
  this,
  "RemoteNodePickerNotice",
  "resource://devtools/server/actors/highlighters/remote-node-picker-notice.js",
  true
);

const IS_OSX = Services.appinfo.OS === "Darwin";

class NodePicker {
  #eventListenersAbortController;
  #remoteNodePickerNoticeHighlighter;

  constructor(walker, targetActor) {
    this._walker = walker;
    this._targetActor = targetActor;

    this._isPicking = false;
    this._hoveredNode = null;
    this._currentNode = null;

    this._onHovered = this._onHovered.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onPick = this._onPick.bind(this);
    this._onSuppressedEvent = this._onSuppressedEvent.bind(this);
    this._preventContentEvent = this._preventContentEvent.bind(this);
  }

  get remoteNodePickerNoticeHighlighter() {
    if (!this.#remoteNodePickerNoticeHighlighter) {
      const env = new HighlighterEnvironment();
      env.initFromTargetActor(this._targetActor);
      this.#remoteNodePickerNoticeHighlighter = new RemoteNodePickerNotice(env);
    }

    return this.#remoteNodePickerNoticeHighlighter;
  }

  /**
   * Find the element from the passed mouse event. If shift isn't pressed (or shiftKey is false)
   * this will ignore all elements who can't consume pointer events (e.g. with inert attribute
   * or `pointer-events: none` style).
   *
   * @param {MouseEvent} event
   * @param {Boolean} shiftKey: If passed, will override event.shiftKey
   * @returns {Object} An object compatible with the disconnectedNode type.
   */
  _findAndAttachElement(event, shiftKey = event.shiftKey) {
    // originalTarget allows access to the "real" element before any retargeting
    // is applied, such as in the case of XBL anonymous elements.  See also
    // https://developer.mozilla.org/docs/XBL/XBL_1.0_Reference/Anonymous_Content#Event_Flow_and_Targeting
    let node = event.originalTarget || event.target;

    // When holding the Shift key, search for the element at the mouse position (as opposed
    // to the event target). This would make it possible to pick nodes for which we won't
    // get events for  (e.g. elements with `pointer-events: none`).
    if (shiftKey) {
      node = this._findNodeAtMouseEventPosition(event) || node;
    }

    return this._walker.attachElement(node);
  }

  /**
   * Return the topmost visible element located at the event mouse position. This is
   * different from retrieving the event target as it allows to retrieve elements for which
   * we wouldn't have mouse event triggered (e.g. elements with `pointer-events: none`)
   *
   * @param {MouseEvent} event
   * @returns HTMLElement
   */
  _findNodeAtMouseEventPosition(event) {
    const win = this._targetActor.window;
    const winUtils = win.windowUtils;
    const rectSize = 1;
    const elements = Array.from(
      winUtils.nodesFromRect(
        // aX
        event.clientX,
        // aY
        event.clientY,
        // aTopSize
        rectSize,
        // aRightSize
        rectSize,
        // aBottomSize
        rectSize,
        // aLeftSize
        rectSize,
        // aIgnoreRootScrollFrame
        true,
        // aFlushLayout
        false,
        // aOnlyVisible
        true,
        // aTransparencyThreshold
        1
      )
    ).filter(element => {
      // Strip out text nodes, we want to highlight Elements only
      return !win.Text.isInstance(element);
    });

    if (!elements.length) {
      return null;
    }

    if (elements.length === 1) {
      return elements[0];
    }

    // Let's return the first element that we find that is not a parent of another matching
    // element, so we get the "deepest" element possible.
    // At this points, we have at least 2 elements and are guaranteed to find an element
    // which is not the parent of any other ones.
    return elements.find(
      element => !elements.some(e => element !== e && element.contains(e))
    );
  }

  /**
   * Returns `true` if the event was dispatched from a window included in
   * the current highlighter environment; or if the highlighter environment has
   * chrome privileges
   *
   * @param {Event} event
   *          The event to allow
   * @return {Boolean}
   */
  _isEventAllowed({ view }) {
    // Allow "non multiprocess" browser toolbox to inspect documents loaded in the parent
    // process (e.g. about:robots)
    if (this._targetActor.window.isChromeWindow) {
      return true;
    }

    return this._targetActor.windows.includes(view);
  }

  /**
   * Returns true if the passed event original target is in the RemoteNodePickerNotice.
   *
   * @param {Event} event
   * @returns {Boolean}
   */
  _isEventInRemoteNodePickerNotice(event) {
    return (
      this.#remoteNodePickerNoticeHighlighter &&
      event.originalTarget?.closest?.(
        `#${this.#remoteNodePickerNoticeHighlighter.rootElementId}`
      )
    );
  }

  /**
   * Pick a node on click.
   *
   * This method doesn't respond anything interesting, however, it starts
   * mousemove, and click listeners on the content document to fire
   * events and let connected clients know when nodes are hovered over or
   * clicked.
   *
   * Once a node is picked, events will cease, and listeners will be removed.
   */
  _onPick(event) {
    // If the picked node is a remote frame, then we need to let the event through
    // since there's a highlighter actor in that sub-frame also picking.
    if (isRemoteBrowserElement(event.target)) {
      return;
    }

    this._preventContentEvent(event);
    if (!this._isEventAllowed(event)) {
      return;
    }

    // If the click was done inside the node picker notice highlighter (e.g. clicking the
    // close button), directly call its `onClick` method, as it doesn't have event listeners
    // itself, to avoid managing events (+ suppressedEventListeners) for the same target
    // from different places.
    if (this._isEventInRemoteNodePickerNotice(event)) {
      this.#remoteNodePickerNoticeHighlighter.onClick(event);
      return;
    }

    // If Ctrl (Or Cmd on OSX) is pressed, this is only a preview click.
    // Send the event to the client, but don't stop picking.
    if ((IS_OSX && event.metaKey) || (!IS_OSX && event.ctrlKey)) {
      this._walker.emit(
        "picker-node-previewed",
        this._findAndAttachElement(event)
      );
      return;
    }

    this._stopPicking();

    if (!this._currentNode) {
      this._currentNode = this._findAndAttachElement(event);
    }

    this._walker.emit("picker-node-picked", this._currentNode);
  }

  /**
   * mousemove event handler
   *
   * @param {MouseEvent} event
   * @param {Boolean} shiftKeyOverride: If passed, will override event.shiftKey in _findAndAttachElement
   */
  _onHovered(event, shiftKeyOverride) {
    // If the hovered node is a remote frame, then we need to let the event through
    // since there's a highlighter actor in that sub-frame also picking.
    if (isRemoteBrowserElement(event.target)) {
      return;
    }

    this._preventContentEvent(event);
    if (!this._isEventAllowed(event)) {
      return;
    }

    this._lastMouseMoveEvent = event;

    // Always call remoteNodePickerNotice handleHoveredElement so the hover state can be updated
    // (it doesn't have its own event listeners to avoid managing events and suppressed
    // events for the same target from different places).
    if (this.#remoteNodePickerNoticeHighlighter) {
      this.#remoteNodePickerNoticeHighlighter.handleHoveredElement(event);
      if (this._isEventInRemoteNodePickerNotice(event)) {
        return;
      }
    }

    this._currentNode = this._findAndAttachElement(event, shiftKeyOverride);
    if (this._hoveredNode !== this._currentNode.node) {
      this._walker.emit("picker-node-hovered", this._currentNode);
      this._hoveredNode = this._currentNode.node;
    }
  }

  // eslint-disable-next-line complexity
  _onKeyDown(event) {
    if (!this._currentNode || !this._isPicking) {
      return;
    }

    this._preventContentEvent(event);
    if (!this._isEventAllowed(event)) {
      return;
    }

    let currentNode = this._currentNode.node.rawNode;

    /**
     * KEY: Action/scope
     * LEFT_KEY: wider or parent
     * RIGHT_KEY: narrower or child
     * ENTER/CARRIAGE_RETURN: Picks currentNode
     * ESC/CTRL+SHIFT+C: Cancels picker, picks currentNode
     * SHIFT: Trigger onHover, handling `pointer-events: none` nodes
     */
    switch (event.keyCode) {
      // Wider.
      case event.DOM_VK_LEFT:
        if (!currentNode.parentElement) {
          return;
        }
        currentNode = currentNode.parentElement;
        break;

      // Narrower.
      case event.DOM_VK_RIGHT:
        if (!currentNode.children.length) {
          return;
        }

        // Set firstElementChild by default
        let child = currentNode.firstElementChild;
        // If currentNode is parent of hoveredNode, then
        // previously selected childNode is set
        const hoveredNode = this._hoveredNode.rawNode;
        for (const sibling of currentNode.children) {
          if (sibling.contains(hoveredNode) || sibling === hoveredNode) {
            child = sibling;
          }
        }

        currentNode = child;
        break;

      // Select the element.
      case event.DOM_VK_RETURN:
        this._onPick(event);
        return;

      // Cancel pick mode.
      case event.DOM_VK_ESCAPE:
        this.cancelPick();
        this._walker.emit("picker-node-canceled");
        return;
      case event.DOM_VK_C:
        const { altKey, ctrlKey, metaKey, shiftKey } = event;

        if (
          (IS_OSX && metaKey && altKey | shiftKey) ||
          (!IS_OSX && ctrlKey && shiftKey)
        ) {
          this.cancelPick();
          this._walker.emit("picker-node-canceled");
        }
        return;
      case event.DOM_VK_SHIFT:
        this._onHovered(this._lastMouseMoveEvent, true);
        return;
      default:
        return;
    }

    // Store currently attached element
    this._currentNode = this._walker.attachElement(currentNode);
    this._walker.emit("picker-node-hovered", this._currentNode);
  }

  _onKeyUp(event) {
    if (event.keyCode === event.DOM_VK_SHIFT) {
      this._onHovered(this._lastMouseMoveEvent, false);
    }
    this._preventContentEvent(event);
  }

  _onSuppressedEvent(event) {
    if (event.type == "mousemove") {
      this._onHovered(event);
    } else if (event.type == "mouseup") {
      // Suppressed mousedown/mouseup events will be sent to us before they have
      // been converted into click events. Just treat any mouseup as a click.
      this._onPick(event);
    }
  }

  // In most cases, we need to prevent content events from reaching the content. This is
  // needed to avoid triggering actions such as submitting forms or following links.
  // In the case where the event happens on a remote frame however, we do want to let it
  // through. That is because otherwise the pickers started in nested remote frames will
  // never have a chance of picking their own elements.
  _preventContentEvent(event) {
    if (isRemoteBrowserElement(event.target)) {
      return;
    }
    event.stopPropagation();
    event.preventDefault();
  }

  /**
   * When the debugger pauses execution in a page, events will not be delivered
   * to any handlers added to elements on that page. This method uses the
   * document's setSuppressedEventListener interface to bypass this restriction:
   * events will be delivered to the callback at times when they would
   * otherwise be suppressed. The set of events delivered this way is currently
   * limited to mouse events.
   *
   * @param callback The function to call with suppressed events, or null.
   */
  _setSuppressedEventListener(callback) {
    if (!this._targetActor?.window?.document) {
      return;
    }

    // Pass the callback to setSuppressedEventListener as an EventListener.
    this._targetActor.window.document.setSuppressedEventListener(
      callback ? { handleEvent: callback } : null
    );
  }

  _startPickerListeners() {
    const target = this._targetActor.chromeEventHandler;
    this.#eventListenersAbortController = new AbortController();
    const config = {
      capture: true,
      signal: this.#eventListenersAbortController.signal,
    };
    target.addEventListener("mousemove", this._onHovered, config);
    target.addEventListener("click", this._onPick, config);
    target.addEventListener("mousedown", this._preventContentEvent, config);
    target.addEventListener("mouseup", this._preventContentEvent, config);
    target.addEventListener("dblclick", this._preventContentEvent, config);
    target.addEventListener("keydown", this._onKeyDown, config);
    target.addEventListener("keyup", this._onKeyUp, config);

    this._setSuppressedEventListener(this._onSuppressedEvent);
  }

  _stopPickerListeners() {
    this._setSuppressedEventListener(null);

    if (this.#eventListenersAbortController) {
      this.#eventListenersAbortController.abort();
      this.#eventListenersAbortController = null;
    }
  }

  _stopPicking() {
    this._stopPickerListeners();
    this._isPicking = false;
    this._hoveredNode = null;
    this._lastMouseMoveEvent = null;
    if (this.#remoteNodePickerNoticeHighlighter) {
      this.#remoteNodePickerNoticeHighlighter.hide();
    }
  }

  cancelPick() {
    if (this._targetActor.threadActor) {
      this._targetActor.threadActor.showOverlay();
    }

    if (this._isPicking) {
      this._stopPicking();
    }
  }

  pick(doFocus = false, isLocalTab = true) {
    if (this._targetActor.threadActor) {
      this._targetActor.threadActor.hideOverlay();
    }

    if (this._isPicking) {
      return;
    }

    this._startPickerListeners();
    this._isPicking = true;

    if (doFocus) {
      this._targetActor.window.focus();
    }

    if (!isLocalTab) {
      this.remoteNodePickerNoticeHighlighter.show();
    }
  }

  resetHoveredNodeReference() {
    this._hoveredNode = null;
  }

  destroy() {
    this.cancelPick();

    this._targetActor = null;
    this._walker = null;
    this.#remoteNodePickerNoticeHighlighter = null;
  }
}

exports.NodePicker = NodePicker;
