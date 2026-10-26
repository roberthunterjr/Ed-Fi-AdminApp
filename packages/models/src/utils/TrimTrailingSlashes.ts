import { Transform } from 'class-transformer';
import { trimTrailingSlashes } from '@edanalytics/utils';

/**
 * Strips trailing slashes from a string property so base URLs can be joined with a path
 * (e.g. `${adminApiUrl}/connect/register`) without producing a double slash.
 */
export default function TrimTrailingSlashes() {
  return Transform(({ value }) => (typeof value === 'string' ? trimTrailingSlashes(value) : value));
}
