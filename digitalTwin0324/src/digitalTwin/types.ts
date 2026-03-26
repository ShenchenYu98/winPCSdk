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
  bizRobotNameEn: string
}

export interface queryWeAgentParams {
  partnerAccount: string
}

export interface WeAgentDetails {
  name: string,
  icon: string,
  desc: string,
  moduleId: string,
  appKey: string,
  appSecret: string,
  partnerAccount: string,
  createdBy: string,
  creatorName: string,
  creatorNameEn: string,
  ownerWelinkId: string,
  ownerName: string,
  ownerNameEn: string,
  ownerDeptName: string,
  ownerDeptNameEn: string,
  bizRobotId: string,
  weCodeUrl: string
}
