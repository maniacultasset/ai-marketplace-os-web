import type { components, paths } from './schema'

/** Every path in the OpenAPI document, minus the `/api/v1` prefix (the client's baseUrl). */
export type V1Paths = {
  [K in keyof paths as K extends `/api/v1${infer Rest}` ? Rest : never]: paths[K]
}

/** Shorthand for generated schema types: `Schema<'ProductOut'>`. */
export type Schemas = components['schemas']
export type Schema<K extends keyof Schemas> = Schemas[K]

export type Role = Schema<'MeOut'>['role']
export type Me = Schema<'MeOut'>
export type Membership = Schema<'MembershipOut'>
export type TokenResponse = Schema<'TokenResponse'>
/** POST /auth/login and the challenge steps (contract 2.0.0): tokens, or the next sign-in step. */
export type LoginResult = Schema<'LoginResult'>
export type SignInStatus = NonNullable<LoginResult['status']>
export type LoginConfirmOut = Schema<'LoginConfirmOut'>
export type TotpEnrollOut = Schema<'TotpEnrollOut'>
export type SecurityOut = Schema<'SecurityOut'>
export type StepUpOut = Schema<'StepUpOut'>
export type ErrorCode = Schema<'ErrorCode'>
export type ErrorReport = Schema<'ErrorReport'>
export type ErrorItem = Schema<'ErrorItem'>
export type ErrorDetail = Schema<'ErrorDetail'>
export type JobEnvelope = Schema<'JobEnvelope'>
export type JobState = Schema<'JobState'>
export type PageInfo = Schema<'PageInfo'>

/** Any list response: `{ data: T[], page: PageInfo }`. */
export interface Page<T> {
  data: T[]
  page: PageInfo
}
