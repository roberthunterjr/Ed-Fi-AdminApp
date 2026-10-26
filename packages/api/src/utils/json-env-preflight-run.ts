import { assertJsonEnvVarsParse } from './json-env-preflight';

// Side-effect module: must be imported before anything that loads `config`.
assertJsonEnvVarsParse();
