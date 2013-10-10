/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use dom::bindings::utils::{DOMString, Fallible, null_str_as_empty};
use dom::characterdata::CharacterData;
use dom::document::AbstractDocument;
use dom::node::{AbstractNode, ScriptView, CommentNodeTypeId, Node};
use dom::window::Window;

/// An HTML comment.
pub struct Comment {
    element: CharacterData,
}

impl Comment {
    /// Creates a new HTML comment.
    pub fn new(text: ~str, document: AbstractDocument) -> Comment {
        Comment {
            element: CharacterData::new(CommentNodeTypeId, text, document)
        }
    }

    pub fn Constructor(owner: @mut Window, data: &DOMString) -> Fallible<AbstractNode<ScriptView>> {
        let s = null_str_as_empty(data);
        let cx = (*owner.page).js_info.get_ref().js_compartment.cx.ptr;
        let comment = @Comment::new(s, owner.Document());
        Ok(unsafe { Node::as_abstract_node(cx, comment) })
    }
}
