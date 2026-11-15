import type { ChapterStatus } from '../types/contracts'
export interface ListQuery { page:number; pageSize:number; keyword?:string; status?:string; chapterId?:string; difficulty?:string; unclassified?:boolean }
export interface Question { id:string; chapterId:string; content:string; status:ChapterStatus; difficulty:string|null; createdAt:string; updatedAt:string }
export interface Option { id:string; label:string; content:string; isCorrect:boolean; displayOrder:number }
export interface QuestionDetail { question:Question; options:Option[] }
export interface QuestionInput { difficulty:string;content:string; options:{content:string;isCorrect:boolean}[] }
export interface Progress { draft:number;published:number;archived:number;validPublished:number;difficulties?:DifficultyCount[] }
export type ExamStatus = 'Draft'|'Scheduled'|'Active'|'Closed'|'Cancelled'
export interface ExamInput { chapterId:string; name:string;description:string|null;durationMinutes:number;startAt:string|null;endAt:string|null }
export interface Exam extends ExamInput { id:string;questionCount:number;status:ExamStatus;openedAt:string|null;closedAt:string|null;createdAt:string;updatedAt:string;permissionCount:number;attemptCount:number }
export interface Permission { studentId:string;username:string;fullName:string;status:'Granted'|'Revoked';grantedAt:string;revokedAt:string|null;hasAttempt:boolean;gradeId?:string|null;gradeName?:string|null;attemptStatus?:string|null }
export interface BulkItem { studentId:string;granted:boolean;detail:string|null }
export type AttemptStatus = 'InProgress'|'Submitted'|'AutoSubmitted'
export interface ResultRow { studentId:string;username:string;fullName:string;permissionStatus:'Granted'|'Revoked';attemptId:string|null;attemptStatus:AttemptStatus|null;score:number|null;correctAnswers:number|null;incorrectAnswers:number|null;unansweredAnswers:number|null;percentage:number|null;submittedAt:string|null }
export interface AttemptResult { studentId:string|null;studentUsername:string|null;studentFullName:string|null;startedAt:string|null;attemptId:string;examId:string;status:AttemptStatus;totalQuestions:number;answeredQuestions:number;correctAnswers:number;incorrectAnswers:number;unansweredAnswers:number;score:number;percentage:number;submittedAt:string;questions:{id:string;number:number;content:string;selectedOptionId:string|null;isCorrect:boolean|null;options:{id:string;label:string;content:string;isCorrect:boolean}[]}[] }


export interface DifficultyCount {difficulty:string|null;total:number;eligiblePublished:number}
export interface BulkPublishRequest {requestId:string;allEligible:boolean;questionIds:string[]}
export interface BulkPublishResult {requestedCount:number;publishedCount:number;skippedCount:number;errors:{questionId:string;code:string}[];difficulties:DifficultyCount[]}
export interface Blueprint {ready:boolean;validPublished:number;levels:{difficulty:string;required:number;available:number}[]}
