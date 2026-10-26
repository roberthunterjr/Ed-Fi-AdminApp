/**
 * Admin App's two "bridge" requests, run in the same `bru run` process as the step:
 * restore-vars → <step> → capture-vars.
 *
 * Bruno runtime variables (bru.setVar/getVar) live only for one process, so values a step
 * captures must be stored by Admin App and restored before the next step. Both scripts are
 * static: values arrive as data through --json-file-path and leave through the report,
 * never spliced into code. Both requests are skipped, so their URLs are never contacted.
 */
export const BRIDGE_DIR = '_adminapp';
export const RESTORE_VARS_FILE = `${BRIDGE_DIR}/restore-vars.bru`;
export const CAPTURE_VARS_FILE = `${BRIDGE_DIR}/capture-vars.bru`;

export const RESTORE_VARS_BRU = `meta {
  name: adminapp-restore-vars
  type: http
  seq: 1
}

get {
  url: http://127.0.0.1:9/adminapp-restore-vars
  body: none
  auth: none
}

script:pre-request {
  const data = bru.runner.iterationData.get();
  for (const [key, value] of Object.entries(data)) {
    bru.setVar(key, value);
  }
  bru.runner.skipRequest();
}
`;

export const CAPTURE_VARS_BRU = `meta {
  name: adminapp-capture-vars
  type: http
  seq: 1
}

post {
  url: http://127.0.0.1:9/adminapp-capture-vars
  body: json
  auth: none
}

body:json {
  {}
}

script:pre-request {
  req.setBody(bru.getAllVars());
  bru.runner.skipRequest();
}
`;
