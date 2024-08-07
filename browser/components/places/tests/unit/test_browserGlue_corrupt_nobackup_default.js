/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim:set ts=2 sw=2 sts=2 et: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that nsBrowserGlue correctly restores default bookmarks if database is
 * corrupt, nor a JSON backup nor bookmarks.html are available.
 */

function run_test() {
  // Remove bookmarks.html from profile.
  remove_bookmarks_html();

  // Remove JSON backup from profile.
  remove_all_JSON_backups();

  run_next_test();
}

add_task(async function () {
  // Create a corrupt database.
  await createCorruptDB();

  // Initialize nsBrowserGlue before Places.
  Cc["@mozilla.org/browser/browserglue;1"].getService(Ci.nsISupports);

  // Check the database was corrupt.
  // nsBrowserGlue uses databaseStatus to manage initialization.
  Assert.equal(
    PlacesUtils.history.databaseStatus,
    PlacesUtils.history.DATABASE_STATUS_CORRUPT
  );

  // The test will continue once import has finished.
  await promiseTopicObserved("places-browser-init-complete");

  // Check that default bookmarks folder has been restored.
  let bm = await PlacesUtils.bookmarks.fetch({
    parentGuid: PlacesUtils.bookmarks.menuGuid,
    index: 0,
  });

  let chanTitle = AppConstants.NIGHTLY_BUILD
    ? "Firefox Nightly Resources"
    : "Mozilla Firefox";
  Assert.equal(bm.title, chanTitle, "Default bookmarks folder restored.");
});
