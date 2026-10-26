// SPDX-License-Identifier: Apache-2.0
// Licensed to the Ed-Fi Alliance under one or more agreements.
// The Ed-Fi Alliance licenses this file to you under the Apache License, Version 2.0.
// See the LICENSE and NOTICES files in the project root for more information.

import { generateClientSecret } from './client-secret';

describe('generateClientSecret', () => {
  it('is 32 characters long by default', () => {
    expect(generateClientSecret()).toHaveLength(32);
  });

  it('always has a lowercase letter, an uppercase letter, a digit and a special character', () => {
    // A purely random secret misses a class about 3% of the time, so 5000 draws would
    // fail with near certainty if the guarantee were broken.
    for (let i = 0; i < 5000; i++) {
      const secret = generateClientSecret();
      expect(secret).toMatch(/[a-z]/);
      expect(secret).toMatch(/[A-Z]/);
      expect(secret).toMatch(/[0-9]/);
      expect(secret).toMatch(/[!@#$%^&*]/);
    }
  });

  it('differs between calls', () => {
    expect(generateClientSecret()).not.toBe(generateClientSecret());
  });
});
