import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSeedData } from './seed';
import { validateData } from './domain';
import { loadData, saveData } from './storage';

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('payroll and existing business snapshots', () => {
  it('opens an old v1 backup without inventing staff or changing original business data', () => {
    const old = createSeedData();
    delete old.payroll;
    const token = JSON.stringify(old);
    localStorage.setItem('xuong-viet.data.v1', token);
    const result = loadData();
    expect(result.data).toEqual(old);
    expect(result.data.payroll).toBeUndefined();
    expect(result.token).toBe(token);
    expect(result.warning).toBeUndefined();
    expect(validateData(old)).toBe(true);
  });

  it('roundtrips payroll together with orders in the same scoped backup', () => {
    const data = createSeedData();
    expect(data.payroll?.employees.length).toBeGreaterThan(0);
    const token = saveData(data, null, 'owner');
    expect(loadData('owner')).toEqual({ data, token });
    expect(loadData('owner').data.orders).toEqual(data.orders);
  });

  it('rejects corrupted salary settings without overwriting the last valid snapshot', () => {
    const data = createSeedData();
    const token = saveData(data, null);
    const broken = structuredClone(data);
    broken.payroll!.settings.standardDays = 0;
    expect(validateData(broken)).toBe(false);
    expect(() => saveData(broken, token)).toThrow('không hợp lệ');
    expect(loadData().token).toBe(token);
    expect(loadData().data.payroll).toEqual(data.payroll);
  });
});
