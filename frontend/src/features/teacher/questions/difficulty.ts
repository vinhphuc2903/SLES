export const difficultyCodes=['RECOGNITION','COMPREHENSION','LOW_APPLICATION','HIGH_APPLICATION'] as const
export type Difficulty=typeof difficultyCodes[number]
export const difficultyLabels:Record<string,string>={RECOGNITION:'Nhận biết',COMPREHENSION:'Thông hiểu',LOW_APPLICATION:'Vận dụng thấp',HIGH_APPLICATION:'Vận dụng cao'}
export const difficultyLabel=(code:string|null|undefined)=>code?difficultyLabels[code]??'Chưa phân loại':'Chưa phân loại'
