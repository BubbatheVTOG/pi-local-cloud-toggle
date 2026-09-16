import test from 'node:test';
import assert from 'node:assert/strict';
import { rememberCloud } from '../extension/state.ts';

test('remember cloud only while in cloud mode', () => {
  const state = { mode: 'cloud', cloud: { provider: 'openai', id: 'gpt' } };
  assert.deepEqual(
    rememberCloud(state, { provider: 'anthropic', id: 'claude' }).cloud,
    { provider: 'anthropic', id: 'claude' },
  );
  assert.deepEqual(
    rememberCloud(
      { mode: 'local', cloud: state.cloud },
      { provider: 'vllm', id: 'bubba' },
    ).cloud,
    state.cloud,
  );
});
