import {useEffect,useRef,useState} from 'react'
import {toast} from 'sonner'
export function remainingSeconds(expiresAt:string,offset:number,now=Date.now()){return Math.max(0,Math.ceil((Date.parse(expiresAt)-now-offset)/1000))}
export function formatRemaining(seconds:number){const h=Math.floor(seconds/3600),m=Math.floor(seconds%3600/60),s=seconds%60;return (h?String(h).padStart(2,'0')+':':'')+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0')}
export function useExamClock(expiresAt:string,startedAt:string,offset:number){
 const [now,setNow]=useState(()=>Date.now()),warned=useRef(new Set<number>())
 useEffect(()=>{const tick=()=>setNow(Date.now());const timer=window.setInterval(tick,250);window.addEventListener('focus',tick);document.addEventListener('visibilitychange',tick);return()=>{clearInterval(timer);window.removeEventListener('focus',tick);document.removeEventListener('visibilitychange',tick)}},[])
 const seconds=remainingSeconds(expiresAt,offset,now)
 useEffect(()=>{
  const duration=(Date.parse(expiresAt)-Date.parse(startedAt))/1000
  const crossed=[300,60,30].filter(t=>duration>=t&&seconds<=t&&!warned.current.has(t))
  crossed.forEach(t=>warned.current.add(t))
  if(seconds>0&&crossed.length){const t=crossed[crossed.length-1]!;toast.warning(t===300?'Bài thi còn không quá 5 phút.':t===60?'Bài thi còn không quá 1 phút.':'Bài thi còn không quá 30 giây.')}
 },[seconds,expiresAt,startedAt])
 return seconds
}
