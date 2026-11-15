import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {act,cleanup,fireEvent,renderHook} from '@testing-library/react'
import {toast} from 'sonner'
import {formatRemaining,remainingSeconds,useExamClock} from '../exams/ExamClock'
import {clockOffset} from '../exams/data'
const start=Date.parse('2026-11-07T00:00:00Z'),iso=(ms:number)=>new Date(ms).toISOString()
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(start);vi.spyOn(toast,'warning').mockImplementation(()=>0)})
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.useRealTimers()})
describe('authoritative exam clock',()=>{
 it('accounts for request midpoint and skew and clamps at zero',()=>{const offset=clockOffset(iso(start+3600100),start,start+200);expect(offset).toBe(3600000);expect(remainingSeconds(iso(start+3660000),offset,start)).toBe(60);expect(remainingSeconds(iso(start+3660000),offset,start+61000)).toBe(0);expect(formatRemaining(3661)).toBe('01:01:01');expect(formatRemaining(59)).toBe('00:59')})
 it('uses absolute time after throttled timers and browser sleep without drift',()=>{const {result}=renderHook(()=>useExamClock(iso(start+600000),iso(start),0));expect(result.current).toBe(600);act(()=>{vi.setSystemTime(start+120000);vi.advanceTimersByTime(250)});expect(result.current).toBe(480);act(()=>{vi.setSystemTime(start+590000);fireEvent(document,new Event('visibilitychange'))});expect(result.current).toBe(10);act(()=>{vi.setSystemTime(start+610000);fireEvent(window,new Event('focus'))});expect(result.current).toBe(0)})
 it('restores deadline on remount instead of restarting duration',()=>{const first=renderHook(()=>useExamClock(iso(start+600000),iso(start),0));first.unmount();vi.setSystemTime(start+400000);const {result}=renderHook(()=>useExamClock(iso(start+600000),iso(start),0));expect(result.current).toBe(200)})
 it('warns once at five minutes, one minute and thirty seconds',()=>{renderHook(()=>useExamClock(iso(start+600000),iso(start),0));for(const elapsed of [300000,540000,570000])act(()=>{vi.setSystemTime(start+elapsed);fireEvent(window,new Event('focus'))});expect(vi.mocked(toast.warning).mock.calls.map(c=>c[0])).toEqual(['Bài thi còn không quá 5 phút.','Bài thi còn không quá 1 phút.','Bài thi còn không quá 30 giây.']);act(()=>vi.advanceTimersByTime(1000));expect(toast.warning).toHaveBeenCalledTimes(3)})
 it('skips thresholds longer than the authoritative allowed duration',()=>{renderHook(()=>useExamClock(iso(start+45000),iso(start),0));expect(toast.warning).not.toHaveBeenCalled();act(()=>{vi.setSystemTime(start+16000);fireEvent(window,new Event('focus'))});expect(toast.warning).toHaveBeenCalledExactlyOnceWith('Bài thi còn không quá 30 giây.')})
 it('uses a newly sampled server offset after reconnect',()=>{const {result,rerender}=renderHook(({offset})=>useExamClock(iso(start+3660000),iso(start+3600000),offset),{initialProps:{offset:3600000}});expect(result.current).toBe(60);rerender({offset:3630000});expect(result.current).toBe(30)})
})
