// SPDX-License-Identifier: Apache-2.0
// Licensed to the Ed-Fi Alliance under one or more agreements.
// The Ed-Fi Alliance licenses this file to you under the Apache License, Version 2.0.
// See the LICENSE and NOTICES files in the project root for more information.

import { randomInt } from 'crypto';

const LOWERCASE = 'abcdefghijklmnopqrstuvwxyz';
const UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGITS = '0123456789';
const SPECIAL = '!@#$%^&*';
const ALL_CHARACTERS = LOWERCASE + UPPERCASE + DIGITS + SPECIAL;

const pick = (charset: string) => charset[randomInt(charset.length)];

/**
 * Generates an Admin API client secret.
 *
 * The Admin API rejects (400) secrets that lack a lowercase letter, an uppercase letter, a
 * digit or a special character. A purely random 32 character string misses one of those
 * classes about 3% of the time, so one character of each class is guaranteed and the rest
 * is random; the result is then shuffled so the guaranteed characters are not predictable.
 */
export function generateClientSecret(length = 32): string {
  const characters = [pick(LOWERCASE), pick(UPPERCASE), pick(DIGITS), pick(SPECIAL)];
  while (characters.length < length) {
    characters.push(pick(ALL_CHARACTERS));
  }
  for (let i = characters.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [characters[i], characters[j]] = [characters[j], characters[i]];
  }
  return characters.join('');
}
