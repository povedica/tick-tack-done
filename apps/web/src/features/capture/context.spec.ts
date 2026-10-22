import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { composerContextFor } from './context';
const now = new Date('2026-10-22T10:00:00Z');
const context = (pathname: string, search = '') => composerContextFor({pathname, search}, {now, timeZone: 'Europe/Madrid'});
describe('TTD-AUD-92 composer context', () => {
  it('prefills today, tomorrow, next seven days and the calendar cursor', () => {
    expect(context('/today').date).toMatchObject({ dueDate: '2026-10-21T22:00:00.000Z', allDay: true });
    expect(context('/smart/tomorrow').date).toMatchObject({ dueDate: '2026-10-22T22:00:00.000Z', allDay: true });
    expect(context('/smart/next_7_days').date).toMatchObject({ dueDate: '2026-10-21T22:00:00.000Z', allDay: true });
    expect(context('/calendar/week','?date=2026-11-03').date).toMatchObject({ dueDate: '2026-11-02T23:00:00.000Z', allDay: true });
  });
  it('prefills a list or tag and leaves other views undated', () => {
    expect(context('/list/casa').project).toBe('casa');
    expect(context('/tag/r80').tags).toEqual(['r80']);
    expect(context('/focus').date).toBeUndefined();
    expect(context('/filter/custom').date).toBeUndefined();
  });
});

it('TTD-AUD-92 inherits only unambiguous AND filter constraints and a default column',()=>{
  const cache=new QueryClient();
  const rules={combinator:'AND',groups:[{combinator:'AND',conditions:[{field:'list',op:'in',value:['casa']},{field:'tag',op:'any_of',value:['r80']},{field:'date',op:'today'}]}]};
  cache.setQueryData(['filters'],{items:[{id:'one',rules}]});cache.setQueryData(['columns','casa'],{items:[{id:'first'}]});
  expect(composerContextFor({pathname:'/filter/one'},{now,timeZone:'Europe/Madrid',cache})).toMatchObject({project:'casa',tags:['r80'],columnId:'first',date:{dueDate:'2026-10-21T22:00:00.000Z'}});
  cache.setQueryData(['filters'],{items:[{id:'one',rules:{...rules,combinator:'OR'}}]});
  expect(composerContextFor({pathname:'/filter/one'},{now,timeZone:'Europe/Madrid',cache})).toEqual({text:''});
});
