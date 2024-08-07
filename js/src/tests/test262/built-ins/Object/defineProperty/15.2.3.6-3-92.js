// Copyright (c) 2012 Ecma International.  All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
es5id: 15.2.3.6-3-92
description: >
    Object.defineProperty - 'Attributes' is a Date object that uses
    Object's [[Get]] method to access the 'configurable' property
    (8.10.5 step 4.a)
---*/

var obj = {};

var dateObj = new Date(0);

dateObj.configurable = true;

Object.defineProperty(obj, "property", dateObj);

var beforeDeleted = obj.hasOwnProperty("property");

delete obj.property;

var afterDeleted = obj.hasOwnProperty("property");

assert.sameValue(beforeDeleted, true, 'beforeDeleted');
assert.sameValue(afterDeleted, false, 'afterDeleted');

reportCompare(0, 0);
