import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

// Offline integration tests: replace the CLI, not the server or subprocess API.
// Neither Supabase credentials nor a running database are needed.
async function withServer(url, fn, mode = '') {
  const dir = await mkdtemp(join(tmpdir(), 'supabase-mcp-test-'));
  const stub = `#!${process.execPath}\nconst args = process.argv.slice(2);\nif (args.includes('--version')) { if (process.env.STUB_MODE === 'missing') process.exit(1); console.log('test-cli'); }\nelse if (process.env.STUB_MODE === 'failure') { console.error('test-cli failure'); process.exit(1); }\nelse if (process.env.STUB_MODE === 'stderr') { console.error('test-cli warning'); }\nelse { console.log(JSON.stringify(args)); }\n`;
  const client = new Client({ name: 'security-test', version: '1' }, { capabilities: {} });
  try {
    // npx stub also allows testing the old implementation without downloading code.
    for (const name of ['supabase', 'npx']) await writeFile(join(dir, name), stub, { mode: 0o755 });
    await client.connect(new StdioClientTransport({
      command: process.execPath, args: [resolve('build/index.js')], stderr: 'ignore',
      env: { PATH: dir, SUPABASE_URL: url, SUPABASE_KEY: 'offline-test-key', STUB_MODE: mode },
    }));
    await fn(client, dir);
  } finally {
    await client.close();
    await rm(dir, { recursive: true, force: true });
  }
}

const generate = (client, args = {}) => client.callTool({ name: 'generate_types', arguments: args });

test('local generation defaults to public', async () => {
  await withServer('http://localhost:54321', async (client) => {
    const result = await generate(client);
    assert.equal(result.isError, undefined);
    assert.deepEqual(JSON.parse(result.content[0].text), ['gen', 'types', 'typescript', '--local', '--schema=public']);
  });
});

test('remote generation preserves the project and schema arguments', async () => {
  await withServer('https://exampleproject.supabase.co', async (client) => {
    const result = await generate(client, { schema: 'public,auth' });
    assert.deepEqual(JSON.parse(result.content[0].text), ['gen', 'types', 'typescript', '--project-id=exampleproject', '--schema=public,auth']);
  });
});

test('schema shell syntax is literal data and cannot create a marker', async () => {
  await withServer('http://localhost:54321', async (client, dir) => {
    const marker = join(dir, 'injected');
    const schemas = [
      `public; printf injected > ${marker}`,
      `public$(printf injected > ${marker})`,
      'public`printf injected > ' + marker + '`',
      `public\nprintf injected > ${marker}`,
      'schema with spaces', 'a"b', "a'b", '--help', 'public && echo injected', 'public|echo injected',
    ];
    for (const schema of schemas) {
      const result = await generate(client, { schema });
      await assert.rejects(access(marker), { code: 'ENOENT' });
      assert.equal(result.isError, undefined);
      assert.deepEqual(JSON.parse(result.content[0].text), ['gen', 'types', 'typescript', '--local', `--schema=${schema}`]);
    }
  });
});

test('rejects non-string schemas', async () => {
  await withServer('http://localhost:54321', async (client) => {
    for (const schema of [1, null, [], {}]) {
      const result = await generate(client, { schema });
      assert.equal(result.isError, true);
      assert.match(result.content[0].text, /Invalid type generation arguments/);
    }
  });
});

test('CLI failures remain tool errors', async () => {
  await withServer('http://localhost:54321', async (client) => {
    const result = await generate(client);
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /Failed to generate types/);
  }, 'failure');
});

test('CLI stderr remains available when stdout is empty', async () => {
  await withServer('http://localhost:54321', async (client) => {
    const result = await generate(client);
    assert.equal(result.content[0].text.trim(), 'test-cli warning');
  }, 'stderr');
});


test('unavailable CLI returns installation guidance', async () => {
  await withServer('http://localhost:54321', async (client) => {
    const result = await generate(client);
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /Supabase CLI not found/);
  }, 'missing');
});


test('SDK upgrade preserves tool discovery and local PostgREST query behavior', async () => {
  const requests = [];
  const api = createServer((req, res) => {
    requests.push({ url: req.url, schema: req.headers['accept-profile'] });
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify([{ id: 1, name: 'example' }]));
  });
  api.listen(0, '127.0.0.1');
  await once(api, 'listening');
  try {
    await withServer(`http://127.0.0.1:${api.address().port}`, async (client) => {
      const tools = await client.listTools();
      assert.deepEqual(tools.tools.map((tool) => tool.name), ['query_table', 'generate_types']);
      const result = await client.callTool({ name: 'query_table', arguments: {
        schema: 'api', table: 'users', select: 'id,name',
        where: [{ column: 'id', operator: 'eq', value: 1 }],
      } });
      assert.equal(result.isError, undefined);
      assert.deepEqual(JSON.parse(result.content[0].text), [{ id: 1, name: 'example' }]);
      assert.equal(requests.length, 1);
      const url = new URL(requests[0].url, 'http://localhost');
      assert.equal(url.pathname, '/rest/v1/users');
      assert.equal(url.searchParams.get('select'), 'id,name');
      assert.equal(url.searchParams.get('id'), 'eq.1');
      assert.equal(url.searchParams.get('limit'), '25');
      assert.equal(requests[0].schema, 'api');
    });
  } finally {
    await new Promise((resolve, reject) => api.close((error) => error ? reject(error) : resolve()));
  }
});
