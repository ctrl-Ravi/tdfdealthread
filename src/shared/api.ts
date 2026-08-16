/** Generic error detail for all responses. */
export type ErrorRsp = { error: string; status: number }

export type Endpoint = (typeof Endpoint)[keyof typeof Endpoint]
export const Endpoint = {
  OnAppInstall: 'internal/on/app/install',
  OnPostSubmit: 'internal/on/post/submit',
  OnPostDelete: 'internal/on/post/delete',
  PopulateCommentsJob: 'internal/job/populateComments',
  OnMenuManage: 'internal/on/menu/manage',
  ManageGet: 'api/manage/megathread',
  ManageRefresh: 'api/manage/refresh',
  ManageEdit: 'api/manage/edit',
  ManageImage: 'api/manage/image',
  ManageDelete: 'api/manage/delete',
  ManageCreate: 'api/manage/create',
  ManageCommentEdit: 'api/manage/comment/edit',
  ManageCommentDelete: 'api/manage/comment/delete',
  ManageCommentRestore: 'api/manage/comment/restore',
  ManageCommentPublishPending: 'api/manage/comment/publishpending',
  ManageRecreateMode: 'api/manage/recreatemode',
  ManageSetDefaultImage: 'api/manage/defaultimage/set',
} as const

export const EndpointMethod = {
  [Endpoint.OnAppInstall]: 'POST',
  [Endpoint.OnMenuManage]: 'POST',
  [Endpoint.OnPostSubmit]: 'POST',
  [Endpoint.OnPostDelete]: 'POST',
  [Endpoint.PopulateCommentsJob]: 'POST',
  [Endpoint.ManageGet]: 'GET',
  [Endpoint.ManageRefresh]: 'POST',
  [Endpoint.ManageEdit]: 'POST',
  [Endpoint.ManageImage]: 'POST',
  [Endpoint.ManageDelete]: 'POST',
  [Endpoint.ManageCreate]: 'POST',
  [Endpoint.ManageCommentEdit]: 'POST',
  [Endpoint.ManageCommentDelete]: 'POST',
  [Endpoint.ManageCommentRestore]: 'POST',
  [Endpoint.ManageCommentPublishPending]: 'POST',
  [Endpoint.ManageRecreateMode]: 'POST',
  [Endpoint.ManageSetDefaultImage]: 'POST',
} as const satisfies { [endpoint: string]: 'GET' | 'POST' }
