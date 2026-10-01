import { expect, test } from '@playwright/test';
import { householdHeaders, register } from '../helpers/api.js';

test('registro semeia categorias de sistema e a árvore respeita as regras', async ({ request }) => {
  await register(request, { name: 'Arvore' });
  const households = await request.get('/households');
  expect(households.ok()).toBeTruthy();
  const [household] = (await households.json()) as { id: string }[];
  expect(household).toBeTruthy();
  const headers = householdHeaders(household.id);

  const listed = await request.get('/categories', { headers });
  expect(listed.ok(), await listed.text()).toBeTruthy();
  const categories = (await listed.json()) as {
    id: string;
    name: string;
    type: string;
    isSystem: boolean;
    parentId: string | null;
  }[];
  expect(categories.filter((category) => category.isSystem && category.type === 'EXPENSE')).toHaveLength(16);
  expect(categories.filter((category) => category.isSystem && category.type === 'INCOME')).toHaveLength(6);

  const groceries = categories.find((category) => category.name === 'Mercado');
  const leisure = categories.find((category) => category.name === 'Lazer e viagens');
  expect(groceries).toBeTruthy();
  expect(leisure).toBeTruthy();

  const duplicateRoot = await request.post('/categories', {
    headers,
    data: { name: 'Mercado', type: 'EXPENSE' },
  });
  expect(duplicateRoot.status()).toBe(409);

  const child = await request.post('/categories', {
    headers,
    data: { name: 'Hortifruti', type: 'EXPENSE', parentId: groceries?.id, isSystem: true, systemKey: 'NOPE' },
  });
  expect(child.ok(), await child.text()).toBeTruthy();
  const hortifruti = (await child.json()) as { id: string; isSystem: boolean; parentId: string };
  expect(hortifruti.isSystem).toBe(false);
  expect(hortifruti.parentId).toBe(groceries?.id);

  const sameNameOtherParent = await request.post('/categories', {
    headers,
    data: { name: 'Hortifruti', type: 'EXPENSE', parentId: leisure?.id },
  });
  expect(sameNameOtherParent.ok(), await sameNameOtherParent.text()).toBeTruthy();

  const sibling = await request.post('/categories', {
    headers,
    data: { name: 'Hortifruti', type: 'EXPENSE', parentId: groceries?.id },
  });
  expect(sibling.status()).toBe(409);

  const wrongType = await request.post('/categories', {
    headers,
    data: { name: 'Extra', type: 'INCOME', parentId: groceries?.id },
  });
  expect(wrongType.status()).toBe(400);

  const patchSystem = await request.patch(`/categories/${groceries?.id}`, {
    headers,
    data: { name: 'Feira' },
  });
  expect(patchSystem.status()).toBe(403);

  const deleteSystem = await request.delete(`/categories/${groceries?.id}`, { headers });
  expect(deleteSystem.status()).toBe(403);

  const moved = await request.patch(`/categories/${hortifruti.id}`, {
    headers,
    data: { parentId: leisure?.id },
  });
  expect(moved.ok(), await moved.text()).toBeTruthy();

  const moveSystem = await request.patch(`/categories/${groceries?.id}`, {
    headers,
    data: { parentId: leisure?.id },
  });
  expect(moveSystem.status()).toBe(403);

  const second = await request.post('/households', { data: { name: 'Outra família' } });
  expect(second.ok(), await second.text()).toBeTruthy();
  const otherHousehold = (await second.json()) as { id: string };
  const otherList = await request.get('/categories', { headers: householdHeaders(otherHousehold.id) });
  expect(otherList.ok()).toBeTruthy();
  const otherCategories = (await otherList.json()) as { id: string; name: string }[];
  const otherGroceries = otherCategories.find((category) => category.name === 'Mercado');
  expect(otherGroceries?.id).not.toBe(groceries?.id);
  expect(otherCategories.filter((category) => category.name === 'Mercado')).toHaveLength(1);
});
