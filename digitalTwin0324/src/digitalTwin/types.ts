export interface CreateDigitalTwinParams {
  name: string,
  icon: string,
  description: string,
  weCrewType: number,
  bizRobotId?: string
}

export interface CreateResult {
  data: {
    robotId: string,
    partnerAccount: string
  },
  message: string,
}

export interface AgentTypeList {
  content: AgentType[]
}

export interface AgentType {
  name: string,
  icon: string,
  bizRobotId: string
}

export interface pageParams {
  pageSize: number,
  pageNumber: number
}

export interface WeAgentList {
  content: WeAgent[]
}

export interface WeAgent {
  name: string,
  icon: string,
  description: string,
  partnerAccount: string,
  bizRobotName: string,
  bizRobotNameEn: string,
  robotId: string
}

export interface queryWeAgentParams {
  partnerAccounts: string[]
}

export interface QueryQrcodeInfoParams {
  qrcode: string
}

export interface QrcodeInfo {
  qrcode: string,
  weUrl: string,
  pcUrl: string,
  expireTime: string,
  status: number,
  expired: boolean
}

export interface updateParams {
  partnerAccount?: string,
  robotId?: string,
  name: string,
  icon: string,
  description: string
}

export interface UpdateQrcodeInfoParams {
  qrcode: string,
  ak?: string,
  status: number
}

export interface deleteParams {
  partnerAccount?: string,
  robotId?: string
}

export interface WeAgentDetails {
  name: string,
  icon: string,
  desc: string,
  moduleId: string,
  appKey: string,
  appSecret: string,
  id: string,
  partnerAccount: string,
  createdBy: string,
  creatorName: string,
  creatorNameEn: string,
  creatorWorkId: string,
  ownerWelinkId: string,
  ownerW3Account: string,
  ownerName: string,
  ownerNameEn: string,
  ownerDeptName: string,
  ownerDeptNameEn: string,
  bizRobotId: string,
  bizRobotTag: string,
  bizRobotName: string,
  bizRobotNameEn: string,
  weCodeUrl: string,
  creatorW3Account: string
}

export type WeAgentDetailsArray = WeAgentDetails[]
export type updateResult = string
export type deleteResult = string
export interface UpdateQrcodeInfoResult {
  status: string
}
