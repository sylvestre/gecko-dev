// |reftest| skip-if(!this.hasOwnProperty('Temporal')) -- Temporal is not enabled unconditionally
// Copyright (C) 2024 Igalia, S.L. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
esid: sec-temporal.zoneddatetime.prototype.since
description: >
  Arithmetic between instances with two different calendars is disallowed
features: [Temporal]
---*/

const instance1 = new Temporal.ZonedDateTime(0n, "UTC", "iso8601");
const instance2 = new Temporal.ZonedDateTime(0n, "UTC", "japanese");
assert.throws(RangeError, () => instance1.since(instance2));

reportCompare(0, 0);
