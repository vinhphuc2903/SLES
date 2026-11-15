import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {act,cleanup,fireEvent,screen,waitFor} from '@testing-library/react'
import {AxiosError,type AxiosAdapter} from 'axios'
import {apiClient,authApi,setAccessToken} from '@/lib/api/apiClient'
import {mountAdmin,firstId} from '@/features/admin/test/adminFixture'
import {createManagementBackend,question} from './managementFixture'
const original=apiClient.defaults.adapter,originalAuth=authApi.defaults.adapter
let backend:ReturnType<typeof createManagementBackend>,mounted:ReturnType<typeof mountAdmin>|undefined
let state:{invalid:boolean;failure:number|null;hold:Promise<void>|null;lose:boolean;failStatus:boolean;status:string;uploads:unknown[];confirms:Record<string,unknown>[];downloads:number}
const path='/teacher/chapters/'+firstId+'/questions'
beforeEach(()=>{
 backend=createManagementBackend();const fallback=apiClient.defaults.adapter as AxiosAdapter
 state={invalid:false,failure:null,hold:null,lose:false,failStatus:false,status:'Ready',uploads:[],confirms:[],downloads:0}
 apiClient.defaults.adapter=async config=>{
  const url=config.url??'';if(!url.includes('/import/'))return fallback(config)
  const ok=(data:unknown)=>({config,headers:{},status:200,statusText:'OK',data})
  const fail=(status:number):never=>{throw new AxiosError('Failure','ERR_BAD_RESPONSE',config,undefined,{config,headers:{},status,statusText:'Failure',data:{error:{code:'importinvalid',message:'Workbook không hợp lệ.'}}})}
  if(state.failure)return fail(state.failure)
  if(url.endsWith('/template')){state.downloads++;return ok(new Blob(['xlsx']))}
  if(url.endsWith('/preview')){state.uploads.push(config.data);return ok({token:state.invalid?null:'opaque-token',expiresAt:'2027-01-01T00:00:00Z',totalRows:2,validRows:state.invalid?1:2,invalidRows:state.invalid?1:0,rows:[2,3].map(n=>({rowNumber:n,questionText:'Import câu '+n,optionA:'Một',optionB:'Hai',optionC:'Ba',optionD:'Bốn',correctAnswer:'B',difficulty:'RECOGNITION',explanation:'Giải thích mẫu',errors:state.invalid&&n===2?['OptionA: không được trống.']:[]}))})}
  if(url.endsWith('/confirm')){
   state.confirms.push(JSON.parse(config.data));if(state.hold)await state.hold
   if(state.status==='Ready'){backend.questions.push({...structuredClone(question),question:{...question.question,id:'import-1',content:'Đã nhập 1'}},{...structuredClone(question),question:{...question.question,id:'import-2',content:'Đã nhập 2'}});state.status='Completed'}
   if(state.lose)throw new AxiosError('Timeout','ECONNABORTED',config)
   return ok({state:state.status,importedCount:state.status==='Completed'?2:0,message:state.status==='Failed'?'Giao dịch đã bị hủy.':null})
  }
  if(url.endsWith('/status')){if(state.failStatus)throw new AxiosError('Network','ERR_NETWORK',config);return ok({state:state.status,importedCount:state.status==='Completed'?2:0,message:null})}
  throw new Error('Unexpected import endpoint')
 }
})
afterEach(()=>{cleanup();mounted?.client.clear();mounted=undefined;apiClient.defaults.adapter=original;authApi.defaults.adapter=originalAuth;setAccessToken(null);vi.restoreAllMocks()})
const mount=(p=path)=>{mounted=mountAdmin(p);return mounted}
const click=(name:string)=>fireEvent.click(screen.getByRole('button',{name}))
async function open(){mount();await screen.findByRole('button',{name:'Import Excel'});click('Import Excel')}
function file(name='questions.xlsx',size?:number){const f=new File(['xlsx'],name,{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});if(size!==undefined)Object.defineProperty(f,'size',{value:size});fireEvent.change(screen.getByLabelText('File Excel'),{target:{files:[f]}})}
async function preview(){await open();file();click('Kiểm tra file');await screen.findByRole('region',{name:'Preview Excel'})}
describe('Excel question import',()=>{
 it('downloads the authenticated template from question bank',async()=>{const create=vi.fn(()=> 'blob:template');Object.defineProperty(URL,'createObjectURL',{configurable:true,value:create});Object.defineProperty(URL,'revokeObjectURL',{configurable:true,value:vi.fn()});vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});mount('/teacher/questions');await screen.findByRole('button',{name:'Tải mẫu Excel'});click('Tải mẫu Excel');await waitFor(()=>expect(create).toHaveBeenCalled());expect(state.downloads).toBe(1)})
 it('previews row numbers, options and explanation using multipart file',async()=>{await preview();expect(state.uploads[0]).toBeInstanceOf(FormData);expect(screen.getByText('Tổng dòng: 2 · Hợp lệ: 2 · Không hợp lệ: 0')).toBeInTheDocument();expect(screen.getAllByText('Giải thích: Giải thích mẫu')).toHaveLength(2);expect(screen.getByRole('button',{name:'Xác nhận import'})).toBeEnabled();expect(state.confirms).toHaveLength(0)})
 it('requires confirmation, sends only token, refreshes questions and progress, never publishes',async()=>{await preview();click('Xác nhận import');expect(screen.getByRole('dialog')).toHaveTextContent('Nhập toàn bộ 2 câu hỏi');click('Nhập tất cả');await screen.findByText('Đã nhập 2 câu hỏi bản nháp.');await screen.findByText('Đã nhập 1');expect(state.confirms).toEqual([{token:'opaque-token'}]);expect(backend.questions.every(q=>q.question.status==='Draft')).toBe(true);expect(backend.teacher.base.requests.filter(r=>r.url.endsWith('/questions/progress')).length).toBeGreaterThan(1);expect(backend.teacher.base.requests.some(r=>r.url.endsWith('/publish'))).toBe(false);expect(screen.getByRole('button',{name:'Xác nhận import'})).toBeDisabled()})
 it('rejects the entire preview if one row is invalid',async()=>{state.invalid=true;await preview();expect(screen.getByText('Hàng 2: OptionA: không được trống.')).toBeInTheDocument();expect(screen.getByText('Tổng dòng: 2 · Hợp lệ: 1 · Không hợp lệ: 1')).toBeInTheDocument();expect(screen.getByRole('button',{name:'Xác nhận import'})).toBeDisabled();expect(state.confirms).toHaveLength(0)})
 it.each([['wrong.xls',3],['large.xlsx',4*1024*1024+1],['empty.xlsx',0]])('rejects invalid local file %s',async(name,size)=>{await open();file(String(name),Number(size));click('Kiểm tra file');expect(await screen.findByRole('alert')).toHaveTextContent('4 MiB');expect(state.uploads).toHaveLength(0)})
 it('displays server workbook validation error',async()=>{await open();state.failure=400;file();click('Kiểm tra file');expect(await screen.findByRole('alert')).toHaveTextContent('Workbook không hợp lệ.');expect(screen.queryByRole('button',{name:'Xác nhận import'})).not.toBeInTheDocument()})
 it('prevents rapid concurrent confirmation',async()=>{let resolve!:()=>void;state.hold=new Promise(r=>resolve=r);await preview();click('Xác nhận import');click('Nhập tất cả');click('Nhập tất cả');await waitFor(()=>expect(state.confirms).toHaveLength(1));await act(async()=>resolve());await screen.findByText('Đã nhập 2 câu hỏi bản nháp.')})
 it('recovers a lost confirm response through status without posting twice',async()=>{state.lose=true;await preview();click('Xác nhận import');click('Nhập tất cả');await screen.findByText('Đã nhập 2 câu hỏi bản nháp.');expect(state.confirms).toHaveLength(1)})
 it('locks upload while result is uncertain and provides explicit status recovery',async()=>{state.lose=true;state.failStatus=true;await preview();click('Xác nhận import');click('Nhập tất cả');await screen.findByRole('button',{name:'Kiểm tra trạng thái import'});await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());expect(screen.getByLabelText('File Excel')).toBeDisabled();expect(screen.getByRole('button',{name:'Xác nhận import'})).toBeDisabled();state.failStatus=false;click('Kiểm tra trạng thái import');await screen.findByText('Đã nhập 2 câu hỏi bản nháp.');expect(state.confirms).toHaveLength(1)})
 it('reports rollback failure without retrying a consumed token',async()=>{state.status='Failed';await preview();click('Xác nhận import');click('Nhập tất cả');await screen.findByText('Giao dịch đã bị hủy.');expect(screen.getByRole('button',{name:'Xác nhận import'})).toBeDisabled();expect(backend.questions).toHaveLength(1)})
 it('clears the old preview when file changes',async()=>{await preview();file('different.xlsx');expect(screen.queryByRole('region',{name:'Preview Excel'})).not.toBeInTheDocument()})
 it('does not offer import into a published chapter',async()=>{backend.teacher.chapters[0]!.chapter.status='Published';mount();await screen.findByText('Câu hỏi gốc');expect(screen.queryByRole('button',{name:'Import Excel'})).not.toBeInTheDocument()})
 it.each(['ADMIN','STUDENT'] as const)('denies %s',async role=>{backend.teacher.base.user.role=role;mount();await screen.findByRole('heading',{name:/chưa có quyền/i});expect(state.uploads).toHaveLength(0)})
})
