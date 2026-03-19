import { CreateDigitalTwinParams, CreateResult, AgentType, AgentTypeList } from "../types";

const DIGITAL_TWIN_BASE_URL = "https://api.assistant.testuat.testWei.com/assistant-api";
const CREATE_DIGITAL_TWIN_URL = `${DIGITAL_TWIN_BASE_URL}/v4-1/we-crew/im-register`;
const GET_AGENT_TYPE_URL = `${DIGITAL_TWIN_BASE_URL}/v4-1/we-crew/inner-assistant/list`;

const INVALID_PARAMETER_ERROR_CODE = 1000;
const NETWORK_ERROR_CODE = 6000;
const SERVER_ERROR_CODE = 7000;

interface DigitalTwinSdkError {
  errorCode: number;
  errorMessage: string;
}

interface DigitalTwinApiResponse<T> {
  code?: number;
  data?: T | null;
  message?: string;
  error?: string;
}

interface CreateDigitalTwinData {
  robotId: string;
  partnerAccount: string;
}

export const createDigitalTwin = async (
  params: CreateDigitalTwinParams
): Promise<CreateResult> => {
  const name = validateRequiredString(params.name, "name");
  const icon = validateRequiredString(params.icon, "icon");
  const description = validateRequiredString(params.description, "description");
  const weCrewType = validateWeCrewType(params.weCrewType);
  const agentType = normalizeOptionalString(params.agentType);

  const payload: CreateDigitalTwinParams = {
    name,
    icon,
    description,
    weCrewType
  };

  if (agentType) {
    payload.agentType = agentType;
  }

  let response: Response;

  try {
    response = await fetch(CREATE_DIGITAL_TWIN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      credentials: "include",
      body: JSON.stringify(payload)
    });
  } catch {
    throw createSdkError(NETWORK_ERROR_CODE, "网络错误");
  }

  const responseBody = await parseResponseBody(response);

  if (!response.ok) {
    throw buildHttpError(response.status, response.statusText, responseBody);
  }

  if (!isDigitalTwinApiResponse<CreateDigitalTwinData>(responseBody)) {
    throw createSdkError(SERVER_ERROR_CODE, "服务端错误: 响应格式非法");
  }

  if (responseBody.code !== 200) {
    throw createSdkError(
      typeof responseBody.code === "number" ? responseBody.code : SERVER_ERROR_CODE,
      getErrorMessage(responseBody, "服务端错误")
    );
  }

  if (!isCreateDigitalTwinData(responseBody.data)) {
    throw createSdkError(SERVER_ERROR_CODE, "服务端错误: 响应数据非法");
  }

  return {
    data: {
      robotId: responseBody.data.robotId,
      partnerAccount: responseBody.data.partnerAccount
    },
    message: getSuccessMessage(responseBody.message)
  };
};

export const getAgentType = async (): Promise<AgentTypeList> => {
  let response: Response;

  try {
    response = await fetch(GET_AGENT_TYPE_URL, {
      method: "GET",
      credentials: "include"
    });
  } catch {
    throw createSdkError(NETWORK_ERROR_CODE, "网络错误");
  }

  const responseBody = await parseResponseBody(response);

  if (!response.ok) {
    throw buildHttpError(response.status, response.statusText, responseBody);
  }

  if (!isDigitalTwinApiResponse<AgentType[]>(responseBody)) {
    throw createSdkError(SERVER_ERROR_CODE, "服务端错误: 响应格式非法");
  }

  if (responseBody.code !== 200) {
    throw createSdkError(
      typeof responseBody.code === "number" ? responseBody.code : SERVER_ERROR_CODE,
      getErrorMessage(responseBody, "服务端错误")
    );
  }

  if (!isAgentTypeListData(responseBody.data)) {
    throw createSdkError(SERVER_ERROR_CODE, "服务端错误: 响应数据非法");
  }

  return {
    content: responseBody.data
  };
};

function createSdkError(errorCode: number, errorMessage: string): DigitalTwinSdkError {
  return {
    errorCode,
    errorMessage
  };
}

function validateRequiredString(value: string, fieldName: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw createSdkError(
      INVALID_PARAMETER_ERROR_CODE,
      `无效的参数: ${fieldName}`
    );
  }

  return value.trim();
}

function normalizeOptionalString(value?: string): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalizedValue = value.trim();
  return normalizedValue || undefined;
}

function validateWeCrewType(value: number): 0 | 1 {
  if (value !== 0 && value !== 1) {
    throw createSdkError(
      INVALID_PARAMETER_ERROR_CODE,
      "无效的参数: weCrewType"
    );
  }

  return value;
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const rawText = await response.text();

  if (!rawText.trim()) {
    return null;
  }

  try {
    return JSON.parse(rawText) as unknown;
  } catch {
    return null;
  }
}

function buildHttpError(
  status: number,
  statusText: string,
  responseBody: unknown
): DigitalTwinSdkError {
  if (isDigitalTwinApiResponse<unknown>(responseBody) && typeof responseBody.code === "number") {
    return createSdkError(
      responseBody.code,
      getErrorMessage(responseBody, `服务端错误: ${status} ${statusText}`)
    );
  }

  return createSdkError(
    SERVER_ERROR_CODE,
    `服务端错误: ${status} ${statusText}`
  );
}

function getErrorMessage(
  responseBody: DigitalTwinApiResponse<unknown>,
  fallbackMessage: string
): string {
  if (typeof responseBody.error === "string" && responseBody.error.trim()) {
    return responseBody.error.trim();
  }

  if (typeof responseBody.message === "string" && responseBody.message.trim()) {
    return responseBody.message.trim();
  }

  return fallbackMessage;
}

function getSuccessMessage(message?: string): string {
  if (typeof message === "string" && message.trim()) {
    return message.trim();
  }

  return "success";
}

function isDigitalTwinApiResponse<T>(value: unknown): value is DigitalTwinApiResponse<T> {
  return isRecord(value);
}

function isCreateDigitalTwinData(value: unknown): value is CreateDigitalTwinData {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.robotId === "string" &&
    value.robotId.trim().length > 0 &&
    typeof value.partnerAccount === "string" &&
    value.partnerAccount.trim().length > 0
  );
}

function isAgentTypeListData(value: unknown): value is AgentType[] {
  return Array.isArray(value) && value.every((item) => isAgentType(item));
}

function isAgentType(value: unknown): value is AgentType {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.name === "string" &&
    value.name.trim().length > 0 &&
    typeof value.icon === "string" &&
    value.icon.trim().length > 0 &&
    typeof value.bizRobotId === "string" &&
    value.bizRobotId.trim().length > 0
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
