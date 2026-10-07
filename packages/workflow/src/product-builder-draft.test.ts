import test from 'node:test';
import assert from 'node:assert/strict';
import { PRODUCT_BUILDER_DRAFT_OUTPUT_SCHEMA, validateProductBuilderProviderDraft } from './index.ts';

test('provider Product Builder draft requires sources, unknowns, metrics and approval', () => {
  assert.equal(PRODUCT_BUILDER_DRAFT_OUTPUT_SCHEMA.additionalProperties, false);
  const result = validateProductBuilderProviderDraft({
    user: '独立开发者',
    scenario: '把产品想法整理成执行计划',
    pain: '信息散落且难以回放',
    value: '按来源生成结构化草稿',
    mvp: { in_scope: ['澄清'], out_of_scope: ['自动发布'] },
    unknowns: ['真实用户访谈'],
    success_metrics: ['来源覆盖率'],
    source_refs: ['workspace://user-input'],
    approval_required: true,
  });
  assert.equal(result.valid, true);
  assert.equal(result.draft?.approval_required, true);
});

test('provider Product Builder draft fails closed before canonical artifact promotion', () => {
  const result = validateProductBuilderProviderDraft({ user: '独立开发者', mvp: {} });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('scenario_required'));
  assert.ok(result.errors.includes('unknowns_required'));
  assert.ok(result.errors.includes('approval_required_must_be_true'));
});
