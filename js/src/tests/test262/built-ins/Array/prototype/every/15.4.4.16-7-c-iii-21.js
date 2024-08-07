// Copyright (c) 2012 Ecma International.  All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
esid: sec-array.prototype.every
description: Array.prototype.every - return value of callbackfn is a Date object
---*/

var accessed = false;

function callbackfn(val, idx, obj) {
  accessed = true;
  return new Date(0);
}

assert([11].every(callbackfn), '[11].every(callbackfn) !== true');
assert(accessed, 'accessed !== true');

reportCompare(0, 0);
