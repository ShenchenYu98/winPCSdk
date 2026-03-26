import mockResponses from "../../../mock/mock.json";
import {
  CreateDigitalTwinParams,
  CreateResult,
  AgentType,
  AgentTypeList,
  pageParams,
  WeAgent,
  WeAgentList,
  queryWeAgentParams,
  WeAgentDetails
} from "../types";

const DIGITAL_TWIN_BASE_URL = "https://api.assistant.testuat.testWei.com/assistant-api";
const CREATE_DIGITAL_TWIN_URL = `${DIGITAL_TWIN_BASE_URL}/v4-1/we-crew/im-register`;
const GET_AGENT_TYPE_URL = `${DIGITAL_TWIN_BASE_URL}/v4-1/we-crew/inner-assistant/list`;
const GET_WE_AGENT_LIST_URL = `${DIGITAL_TWIN_BASE_URL}/v4-1/we-crew/list`;
const GET_WE_AGENT_DETAILS_URL = `${DIGITAL_TWIN_BASE_URL}/v1/robot-partners`;
const GET_WE_AGENT_LIST_MOCK_URL = "mock://assistant-api/v4-1/we-crew/list";
const GET_WE_AGENT_DETAILS_MOCK_URL = "mock://assistant-api/v1/robot-partners";

const INVALID_PARAMETER_ERROR_CODE = 1000;
const NETWORK_ERROR_CODE = 6000;
const SERVER_ERROR_CODE = 7000;
const MOCK_PROTOCOL = "mock:";

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

interface MockResponseConfig {
  status: number;
  body: unknown;
}

interface MockDetailsConfig {
  default: MockResponseConfig;
  byPartnerAccount: Record<string, MockResponseConfig>;
}

interface DigitalTwinMockResponses {
  getWeAgentList: MockResponseConfig;
  getWeAgentDetails: MockDetailsConfig;
}

const typedMockResponses = mockResponses as DigitalTwinMockResponses;

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
    response = await requestDigitalTwin(`${GET_WE_AGENT_LIST_MOCK_URL}?${query.toString()}`, {
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

  if (!isDigitalTwinApiResponse<WeAgent[]>(responseBody)) {
    throw createSdkError(SERVER_ERROR_CODE, "服务端错误: 响应格式非法");
  }

  if (responseBody.code !== 200) {
    throw createSdkError(
      typeof responseBody.code === "number" ? responseBody.code : SERVER_ERROR_CODE,
      getErrorMessage(responseBody, "服务端错误")
    );
  }

  if (!isWeAgentListData(responseBody.data)) {
    throw createSdkError(SERVER_ERROR_CODE, "服务端错误: 响应数据非法");
  }

  return {
    content: responseBody.data
  };
};

export const getWeAgentDetails = async (
  params: queryWeAgentParams
): Promise<WeAgentDetails> => {
  const partnerAccount = validateRequiredString(params.partnerAccount, "partnerAccount");

  let response: Response;

  try {
    response = await requestDigitalTwin(
      `${GET_WE_AGENT_DETAILS_MOCK_URL}/${encodeURIComponent(partnerAccount)}`,
      {
        method: "GET",
        credentials: "include"
      }
    );
  } catch {
    throw createSdkError(NETWORK_ERROR_CODE, "网络错误");
  }

  const responseBody = await parseResponseBody(response);

  if (!response.ok) {
    throw buildHttpError(response.status, response.statusText, responseBody);
  }

  if (!isDigitalTwinApiResponse<WeAgentDetails>(responseBody)) {
    throw createSdkError(SERVER_ERROR_CODE, "服务端错误: 响应格式非法");
  }

  if (responseBody.code !== 200) {
    throw createSdkError(
      typeof responseBody.code === "number" ? responseBody.code : SERVER_ERROR_CODE,
      getErrorMessage(responseBody, "服务端错误")
    );
  }

  if (!isWeAgentDetailsData(responseBody.data)) {
    throw createSdkError(SERVER_ERROR_CODE, "服务端错误: 响应数据非法");
  }

  return responseBody.data;
};

async function requestDigitalTwin(url: string, init: RequestInit): Promise<Response> {
  if (isMockUrl(url)) {
    return buildMockResponse(url);
  }

  return fetch(url, init);
}

function isMockUrl(url: string): boolean {
  return url.startsWith(`${MOCK_PROTOCOL}//`);
}

function buildMockResponse(url: string): Response {
  const mockResponse = resolveMockBody(url);

  return new Response(JSON.stringify(mockResponse.body), {
    status: mockResponse.status,
    statusText: getMockStatusText(mockResponse.status),
    headers: {
      "Content-Type": "application/json"
    }
  });
}

function resolveMockBody(url: string): MockResponseConfig {
  const parsedUrl = new URL(url);
  const pathname = parsedUrl.pathname;

  if (pathname === "/v4-1/we-crew/list") {
    return typedMockResponses.getWeAgentList;
  }

  if (pathname.startsWith("/v1/robot-partners/")) {
    const partnerAccount = decodeURIComponent(pathname.slice("/v1/robot-partners/".length));

    return typedMockResponses.getWeAgentDetails.byPartnerAccount[partnerAccount]
      ?? typedMockResponses.getWeAgentDetails.default;
  }

  return {
    status: 404,
    body: {
      code: 40400,
      data: null,
      message: "mock route not found",
      error: "mock route not found"
    }
  };
}

function getMockStatusText(status: number): string {
  if (status >= 200 && status < 300) {
    return "OK";
  }

  if (status === 404) {
    return "Not Found";
  }

  if (status >= 500) {
    return "Mock Error";
  }

  return "Error";
}

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
      `无效的参数: ${fieldName}`
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
  return isRecord(value) && !Array.isArray(value);
}

function isAgentTypeListData(value: unknown): value is AgentType[] {
  return Array.isArray(value) && value.every((item) => isRecord(item));
}

function isAgentType(value: unknown): value is AgentType {
  return isRecord(value);
}

function isWeAgentListData(value: unknown): value is WeAgent[] {
  return Array.isArray(value) && value.every((item) => isRecord(item));
}

function isWeAgent(value: unknown): value is WeAgent {
  return isRecord(value);
}

function isWeAgentDetailsData(value: unknown): value is WeAgentDetails {
  return isRecord(value) && !Array.isArray(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
