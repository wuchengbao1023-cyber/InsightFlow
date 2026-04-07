/**
 * API客户端服务
 * 处理与DataMind OS后端的通信
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8001';

/**
 * 上传文件到DuckDB
 * @param file 文件对象
 * @param tableName 表名（可选）
 * @returns 上传结果
 */
export const uploadFile = async (file: File, tableName?: string): Promise<any> => {
  const formData = new FormData();
  formData.append('file', file);
  
  if (tableName) {
    formData.append('table_name', tableName);
  }

  const response = await fetch(`${API_BASE_URL}/api/data/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`文件上传失败: ${response.status} ${response.statusText}`);
  }

  return await response.json();
};

/**
 * 获取已上传的数据表列表
 * @returns 表列表
 */
export const getTables = async (): Promise<any> => {
  const response = await fetch(`${API_BASE_URL}/api/data/tables`);
  
  if (!response.ok) {
    throw new Error(`获取表列表失败: ${response.status} ${response.statusText}`);
  }

  return await response.json();
};

/**
 * 执行SQL查询
 * @param sql SQL语句
 * @returns 查询结果
 */
export const executeQuery = async (sql: string): Promise<any> => {
  const response = await fetch(`${API_BASE_URL}/api/data/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql }),
  });

  if (!response.ok) {
    throw new Error(`查询执行失败: ${response.status} ${response.statusText}`);
  }

  return await response.json();
};

/**
 * 获取可用数据源列表
 * @returns 数据源列表
 */
export const getDataSources = async (): Promise<any> => {
  const response = await fetch(`${API_BASE_URL}/api/queries/data-sources`);
  
  if (!response.ok) {
    // 如果后端不支持此端点，返回空数组
    console.warn('获取数据源列表失败，使用空数据源');
    return { data_sources: [], count: 0 };
  }

  return await response.json();
};

/**
 * 执行自然语言查询（SSE流式）
 * @param question 问题
 * @param dataSource 数据源标识
 * @param context 上下文
 * @param visualizationType 可视化类型
 * @returns EventSource响应
 */
export const streamQuery = async (
  question: string,
  dataSource?: string,
  context?: Record<string, any>,
  visualizationType: string = 'auto'
): Promise<Response> => {
  const payload = {
    question,
    data_source: dataSource || 'demo_sales',
    context: context || {},
    visualization_type: visualizationType,
  };

  const response = await fetch(`${API_BASE_URL}/api/queries/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`查询请求失败: ${response.status} ${response.statusText}`);
  }

  return response;
};

/**
 * 获取KPI配置
 * @returns KPI配置
 */
export const getKPIConfig = async (): Promise<any> => {
  const response = await fetch(`${API_BASE_URL}/api/settings/kpis`);
  
  if (!response.ok) {
    console.warn('获取KPI配置失败，使用默认配置');
    return {
      kpis: [],
      project_settings: {
        project_name: '未命名项目',
        project_description: '未设置项目描述',
      },
    };
  }

  return await response.json();
};

/**
 * 更新KPI配置
 * @param kpis KPI列表
 * @param projectName 项目名称
 * @returns 更新结果
 */
export const updateKPIConfig = async (kpis: any[], projectName?: string): Promise<any> => {
  const response = await fetch(`${API_BASE_URL}/api/settings/kpis`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      kpis,
      project_name: projectName,
    }),
  });

  if (!response.ok) {
    throw new Error(`更新KPI配置失败: ${response.status} ${response.statusText}`);
  }

  return await response.json();
};

/**
 * 获取可用分析指标
 * @returns 指标列表
 */
export const getAvailableMetrics = async (): Promise<any> => {
  const response = await fetch(`${API_BASE_URL}/api/settings/analytics/available-metrics`);
  
  if (!response.ok) {
    console.warn('获取可用指标失败，使用默认指标');
    return {
      metrics: [],
      tables: [],
      has_uploaded_data: false,
    };
  }

  return await response.json();
};

/**
 * 保存项目设置
 * @param settings 项目设置
 * @returns 保存结果
 */
export const saveProjectSettings = async (settings: any): Promise<any> => {
  const response = await fetch(`${API_BASE_URL}/api/settings/project-settings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(settings),
  });

  if (!response.ok) {
    throw new Error(`保存项目设置失败: ${response.status} ${response.statusText}`);
  }

  return await response.json();
};

/**
 * 测试API连接
 * @returns 连接状态
 */
export const testAPIConnection = async (): Promise<boolean> => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(`${API_BASE_URL}/api/health`, { signal: controller.signal });
    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
};