import {
  AgentType,
  AgentTypeList,
  CreateDigitalTwinParams,
  CreateResult,
  deleteParams,
  deleteResult,
  pageParams,
  queryWeAgentParams,
  updateParams,
  updateResult,
  WeAgent,
  WeAgentDetailsArray,
  WeAgentList
} from "../types";

const DIGITAL_TWIN_BASE_URL = "https://api.assistant.testuat.testWei.com/assistant-api";
const CREATE_DIGITAL_TWIN_URL = `${DIGITAL_TWIN_BASE_URL}/v4-1/we-crew/im-register`;
const GET_AGENT_TYPE_URL = `${DIGITAL_TWIN_BASE_URL}/v4-1/we-crew/inner-assistant/list`;
const GET_WE_AGENT_LIST_URL = `${DIGITAL_TWIN_BASE_URL}/v4-1/we-crew/list`;
const GET_WE_AGENT_DETAILS_URL = `${DIGITAL_TWIN_BASE_URL}/v1/robot-partners`;
const UPDATE_WE_AGENT_URL = `${DIGITAL_TWIN_BASE_URL}/v4-1/we-crew`;
const DELETE_WE_AGENT_URL = `${DIGITAL_TWIN_BASE_URL}/v4-1/we-crew`;

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
  const agentType = normalizeOptionalString(params.bizRobotId);

  const payload: CreateDigitalTwinParams = {
    name,
    icon,
    description,
    weCrewType,
  };

  if (agentType) {
    payload.bizRobotId = agentType;
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
    throw createSdkError(NETWORK_ERROR_CODE, "Network error");
  }

  const responseBody = await parseResponseBody(response);

  if (!response.ok) {
    throw buildHttpError(response.status, response.statusText, responseBody);
  }

  if (!isDigitalTwinApiResponse<CreateDigitalTwinData>(responseBody)) {
    throw createSdkError(SERVER_ERROR_CODE, "Server error: invalid response format");
  }

  if (responseBody.code !== 200) {
    throw createSdkError(
      typeof responseBody.code === "number" ? responseBody.code : SERVER_ERROR_CODE,
      getErrorMessage(responseBody, "Server error")
    );
  }

  if (!isCreateDigitalTwinData(responseBody.data)) {
    throw createSdkError(SERVER_ERROR_CODE, "Server error: invalid response data");
  }

  return {
    data: responseBody.data,
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
    throw createSdkError(NETWORK_ERROR_CODE, "Network error");
  }

  const responseBody = await parseResponseBody(response);

  if (!response.ok) {
    throw buildHttpError(response.status, response.statusText, responseBody);
  }

  if (!isDigitalTwinApiResponse<AgentType[]>(responseBody)) {
    throw createSdkError(SERVER_ERROR_CODE, "Server error: invalid response format");
  }

  if (responseBody.code !== 200) {
    throw createSdkError(
      typeof responseBody.code === "number" ? responseBody.code : SERVER_ERROR_CODE,
      getErrorMessage(responseBody, "Server error")
    );
  }

  if (!isAgentTypeListData(responseBody.data)) {
    throw createSdkError(SERVER_ERROR_CODE, "Server error: invalid response data");
  }

  return {
    content: responseBody.data
  };
};

export const getWeAgentList = async (
  params: pageParams
): Promise<WeAgentList> => {
  const pageSize = validatePageSize(params.pageSize);
  const pageNumber = validatePageNumber(params.pageNumber);
  const query = new URLSearchParams({
    pageSize: String(pageSize),
    pageNumber: String(pageNumber)
  });

  let response: Response;

  try {
    response = await fetch(`${GET_WE_AGENT_LIST_URL}?${query.toString()}`, {
      method: "GET",
      credentials: "include"
    });
  } catch {
    throw createSdkError(NETWORK_ERROR_CODE, "Network error");
  }

  const responseBody = await parseResponseBody(response);

  if (!response.ok) {
    throw buildHttpError(response.status, response.statusText, responseBody);
  }

  if (!isDigitalTwinApiResponse<unknown>(responseBody)) {
    throw createSdkError(SERVER_ERROR_CODE, "Server error: invalid response format");
  }

  if (responseBody.code !== 200) {
    throw createSdkError(
      typeof responseBody.code === "number" ? responseBody.code : SERVER_ERROR_CODE,
      getErrorMessage(responseBody, "Server error")
    );
  }

  return {
    content: responseBody.data as WeAgent[]
  };
};

export const getWeAgentDetails = async (
  params: queryWeAgentParams
): Promise<WeAgentDetailsArray> => {
  const partnerAccounts = validatePartnerAccounts(params.partnerAccounts);
  const encodedPartnerAccounts = partnerAccounts
    .map((partnerAccount) => encodeURIComponent(partnerAccount))
    .join(",");

  let response: Response;

  try {
    response = await fetch(`${GET_WE_AGENT_DETAILS_URL}/${encodedPartnerAccounts}`, {
      method: "GET",
      credentials: "include"
    });
  } catch {
    throw createSdkError(NETWORK_ERROR_CODE, "Network error");
  }

  const responseBody = await parseResponseBody(response);

  if (!response.ok) {
    throw buildHttpError(response.status, response.statusText, responseBody);
  }

  if (!isDigitalTwinApiResponse<unknown>(responseBody)) {
    throw createSdkError(SERVER_ERROR_CODE, "Server error: invalid response format");
  }

  if (responseBody.code !== 200) {
    throw createSdkError(
      typeof responseBody.code === "number" ? responseBody.code : SERVER_ERROR_CODE,
      getErrorMessage(responseBody, "Server error")
    );
  }

  return responseBody.data as WeAgentDetailsArray;
};

export const updateWeAgent = async (
  params: updateParams
): Promise<updateResult> => {
  const name = validateRequiredString(params.name, "name");
  const icon = validateRequiredString(params.icon, "icon");
  const description = validateRequiredString(params.description, "description");
  const partnerAccount = normalizeOptionalString(params.partnerAccount);
  const robotId = normalizeOptionalString(params.robotId);

  const payload: updateParams = {
    name,
    icon,
    description
  };

  if (partnerAccount) {
    payload.partnerAccount = partnerAccount;
  }

  if (robotId) {
    payload.robotId = robotId;
  }

  let response: Response;

  try {
    response = await fetch(UPDATE_WE_AGENT_URL, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      credentials: "include",
      body: JSON.stringify(payload)
    });
  } catch {
    throw createSdkError(NETWORK_ERROR_CODE, "Network error");
  }

  const responseBody = await parseResponseBody(response);

  if (!response.ok) {
    throw buildHttpError(response.status, response.statusText, responseBody);
  }

  if (!isDigitalTwinApiResponse<unknown>(responseBody)) {
    throw createSdkError(SERVER_ERROR_CODE, "Server error: invalid response format");
  }

  if (responseBody.code !== 200) {
    throw createSdkError(
      typeof responseBody.code === "number" ? responseBody.code : SERVER_ERROR_CODE,
      getErrorMessage(responseBody, "Server error")
    );
  }

  return getSuccessMessage(responseBody.message);
};

export const deleteWeAgent = async (
  params: deleteParams
): Promise<deleteResult> => {
  const partnerAccount = normalizeOptionalString(params.partnerAccount);
  const robotId = normalizeOptionalString(params.robotId);
  const query = new URLSearchParams();

  if (partnerAccount) {
    query.set("partnerAccount", partnerAccount);
  }

  if (robotId) {
    query.set("robotId", robotId);
  }

  const queryString = query.toString();
  const requestUrl = queryString
    ? `${DELETE_WE_AGENT_URL}?${queryString}`
    : DELETE_WE_AGENT_URL;

  let response: Response;

  try {
    response = await fetch(requestUrl, {
      method: "DELETE",
      credentials: "include"
    });
  } catch {
    throw createSdkError(NETWORK_ERROR_CODE, "Network error");
  }

  const responseBody = await parseResponseBody(response);

  if (!response.ok) {
    throw buildHttpError(response.status, response.statusText, responseBody);
  }

  if (!isDigitalTwinApiResponse<unknown>(responseBody)) {
    throw createSdkError(SERVER_ERROR_CODE, "Server error: invalid response format");
  }

  if (responseBody.code !== 200) {
    throw createSdkError(
      typeof responseBody.code === "number" ? responseBody.code : SERVER_ERROR_CODE,
      getErrorMessage(responseBody, "Server error")
    );
  }

  return getSuccessMessage(responseBody.message);
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
      `Invalid parameter: ${fieldName}`
    );
  }

  return value.trim();
}

function validatePartnerAccounts(value: string[]): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw createSdkError(
      INVALID_PARAMETER_ERROR_CODE,
      "Invalid parameter: partnerAccounts"
    );
  }

  const normalizedValues = value.map((item) => {
    if (typeof item !== "string" || !item.trim()) {
      throw createSdkError(
        INVALID_PARAMETER_ERROR_CODE,
        "Invalid parameter: partnerAccounts"
      );
    }

    return item.trim();
  });

  return normalizedValues;
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
      "Invalid parameter: weCrewType"
    );
  }

  return value;
}

function validatePageSize(value: number): number {
  return validateIntegerInRange(value, "pageSize", 1, 100);
}

function validatePageNumber(value: number): number {
  return validateIntegerInRange(value, "pageNumber", 1, 1000);
}

function validateIntegerInRange(
  value: number,
  fieldName: string,
  min: number,
  max: number
): number {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw createSdkError(
      INVALID_PARAMETER_ERROR_CODE,
      `Invalid parameter: ${fieldName}`
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
      getErrorMessage(responseBody, `Server error: ${status} ${statusText}`)
    );
  }

  return createSdkError(
    SERVER_ERROR_CODE,
    `Server error: ${status} ${statusText}`
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
  return isRecord(value) && !Array.isArray(value);
}

function isAgentTypeListData(value: unknown): value is AgentType[] {
  return Array.isArray(value) && value.every((item) => isRecord(item));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
