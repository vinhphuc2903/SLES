import type { Chapter,ChapterDetail,Page } from '@/features/teacher/types/contracts'
export type { Chapter,ChapterDetail,Page }
export interface Subject { id:string;name:string;description:string|null;gradeName:string;chapterCount:number }
export interface Option {id:string;label:string;content:string}
export interface Question {id:string;number:number;content:string;selectedOptionId:string|null;options:Option[]}
export interface Attempt {attemptId:string;chapterId:string;totalQuestions:number;answeredQuestions:number;isSubmitted:boolean;questions:Question[]}
export interface Result {attemptId:string;chapterId:string;chapterName:string;subjectName:string;startedAt:string;totalQuestions:number;answeredQuestions:number;correctAnswers:number;incorrectAnswers:number;unansweredQuestions:number;score:number;percentage:number;completedAt:string;questions:{questionId:string;number:number;content:string;selectedOptionId:string|null;isCorrect:boolean|null;options:(Option & {isCorrect:boolean})[]}[]}
export interface HistoryItem {attemptId:string;chapterId:string;chapterName:string;totalQuestions:number;correctAnswers:number;incorrectAnswers:number;score:number|null;startedAt:string;submittedAt:string|null}
export interface ListParams {page:number;pageSize:number;search?:string;subjectId?:string;chapterId?:string}

