// Copyright (c) 2012 Ecma International.  All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
es5id: 15.2.3.6-4-614
description: >
    ES5 Attributes - all attributes in Array.prototype.every are
    correct
includes: [propertyHelper.js]
---*/

verifyProperty(Array.prototype, "every", {
  writable: true,
  enumerable: false,
  configurable: true,
});

reportCompare(0, 0);
