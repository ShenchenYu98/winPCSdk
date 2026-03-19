export interface CreateDigitalTwinParams {
  name: string,
  icon: string,
  description: string,
  weCrewType: number,
  agentType?: string
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
