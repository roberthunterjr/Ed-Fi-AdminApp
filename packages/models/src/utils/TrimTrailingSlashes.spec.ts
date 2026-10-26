import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import TrimTrailingSlashes from './TrimTrailingSlashes';

class TestDto {
  @TrimTrailingSlashes()
  url: string;
}

describe('TrimTrailingSlashes', () => {
  it('removes a single trailing slash', () => {
    const result = plainToInstance(TestDto, { url: 'https://localhost/the-api-url/' });
    expect(result.url).toBe('https://localhost/the-api-url');
  });

  it('removes repeated trailing slashes', () => {
    const result = plainToInstance(TestDto, { url: 'https://localhost/the-api-url///' });
    expect(result.url).toBe('https://localhost/the-api-url');
  });

  it('leaves a URL with no trailing slash unchanged', () => {
    const result = plainToInstance(TestDto, { url: 'https://localhost/the-api-url' });
    expect(result.url).toBe('https://localhost/the-api-url');
  });

  it('leaves a non-string value (e.g. number) unchanged', () => {
    const result = plainToInstance(TestDto, { url: 42 as unknown as string });
    expect(result.url).toBe(42);
  });
});
