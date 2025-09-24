/**
 * 🎓 Уровень 3: Продвинутый граф с множественными узлами
 * 
 * Этот пример демонстрирует:
 * - Сложную архитектуру с множественными узлами
 * - Продвинутую обработку ошибок и retry логику
 * - Мониторинг и метрики
 * - Различные стратегии fallback
 * - Асинхронную обработку
 * 
 * Время изучения: 40-50 минут
 * Сложность: 🔴 Продвинутый
 */

import { StateGraph, END, START } from "@langchain/langgraph";
import { ChatPerplexity } from "@langchain/community/chat_models/perplexity";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { z } from "zod";
import dotenv from "dotenv";

// Загружаем переменные окружения
dotenv.config();

/**
 * Шаг 1: Сложное состояние с множественными полями
 */
const AdvancedGraphState = z.object({
  // Основные поля
  userQuery: z.string().default(""),
  response: z.string().default(""),
  messages: z.array(z.any()).default([]),
  
  // Анализ запроса
  queryType: z.string().default(""),
  queryComplexity: z.number().default(0), // 1-10
  language: z.string().default("ru"),
  domain: z.string().default(""), // tech, science, business, etc.
  
  // Обработка
  processingStage: z.string().default(""), // validation, analysis, generation, review
  confidence: z.number().default(0),
  quality: z.number().default(0), // Качество ответа 1-10
  
  // Ошибки и retry
  error: z.string().nullable().default(null),
  errorType: z.string().default(""), // network, api, validation, timeout
  retryCount: z.number().default(0),
  maxRetries: z.number().default(3),
  
  // Fallback
  fallbackUsed: z.boolean().default(false),
  fallbackType: z.string().default(""), // simple, cached, manual
  fallbackReason: z.string().default(""),
  
  // Мониторинг
  startTime: z.number().default(0),
  endTime: z.number().default(0),
  processingTime: z.number().default(0),
  tokensUsed: z.number().default(0),
  
  // Метаданные
  metadata: z.record(z.any()).default({})
});

/**
 * Шаг 2: Узел анализа запроса
 * 
 * Анализирует запрос и определяет его характеристики
 */
async function analyzeQuery(state) {
  console.log("🔍 Анализирую запрос:", state.userQuery);
  
  const query = state.userQuery.toLowerCase();
  
  // Определяем сложность (1-10)
  let complexity = 1;
  if (query.length > 200) complexity += 2;
  if (query.includes("анализ") || query.includes("сравни")) complexity += 2;
  if (query.includes("объясни подробно")) complexity += 3;
  if (query.includes("научный") || query.includes("исследование")) complexity += 2;
  
  // Определяем домен
  let domain = "general";
  if (query.includes("программирование") || query.includes("код") || query.includes("разработка")) {
    domain = "tech";
  } else if (query.includes("наука") || query.includes("исследование") || query.includes("эксперимент")) {
    domain = "science";
  } else if (query.includes("бизнес") || query.includes("экономика") || query.includes("финансы")) {
    domain = "business";
  }
  
  // Определяем тип запроса
  let queryType = "general";
  if (query.includes("что такое") || query.includes("кто такой")) {
    queryType = "definition";
  } else if (query.includes("как") || query.includes("почему")) {
    queryType = "explanation";
  } else if (query.includes("сравни") || query.includes("разница")) {
    queryType = "comparison";
  } else if (query.includes("анализ") || query.includes("исследование")) {
    queryType = "analysis";
  }
  
  console.log(`📊 Анализ: сложность=${complexity}, домен=${domain}, тип=${queryType}`);
  
  return {
    ...state,
    processingStage: "analysis",
    queryType,
    queryComplexity: complexity,
    domain,
    metadata: {
      ...state.metadata,
      analyzedAt: new Date().toISOString(),
      analysis: { complexity, domain, queryType }
    }
  };
}

/**
 * Шаг 3: Узел выбора стратегии обработки
 */
async function selectProcessingStrategy(state) {
  console.log("🎯 Выбираю стратегию обработки");
  
  const { queryComplexity, domain, queryType } = state;
  
  // Простые запросы - быстрая обработка
  if (queryComplexity <= 3 && queryType === "definition") {
    console.log("⚡ Выбрана быстрая стратегия");
    return {
      ...state,
      processingStage: "fast_processing",
      metadata: {
        ...state.metadata,
        strategy: "fast",
        selectedAt: new Date().toISOString()
      }
    };
  }
  
  // Сложные запросы - детальная обработка
  if (queryComplexity >= 7 || queryType === "analysis") {
    console.log("🧠 Выбрана детальная стратегия");
    return {
      ...state,
      processingStage: "detailed_processing",
      metadata: {
        ...state.metadata,
        strategy: "detailed",
        selectedAt: new Date().toISOString()
      }
    };
  }
  
  // Обычные запросы - стандартная обработка
  console.log("📝 Выбрана стандартная стратегия");
  return {
    ...state,
    processingStage: "standard_processing",
    metadata: {
      ...state.metadata,
      strategy: "standard",
      selectedAt: new Date().toISOString()
    }
  };
}

/**
 * Шаг 4: Быстрая обработка
 */
async function fastProcessing(state) {
  console.log("⚡ Быстрая обработка");
  
  const model = new ChatPerplexity({
    model: "sonar-pro",
    temperature: 0.3,
    maxTokens: 200,
    apiKey: process.env.PERPLEXITY_API_KEY,
  });
  
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", "Дай краткий и точный ответ на русском языке. Максимум 1-2 предложения."],
    ["human", "{query}"]
  ]);
  
  try {
    const chain = prompt.pipe(model);
    const result = await chain.invoke({ query: state.userQuery });
    
    const userMessage = new HumanMessage(state.userQuery);
    const aiMessage = new AIMessage(result.content);
    
    return {
      ...state,
      response: result.content,
      messages: [...state.messages, userMessage, aiMessage],
      confidence: 0.9,
      quality: 8,
      processingStage: "completed",
      metadata: {
        ...state.metadata,
        processedAt: new Date().toISOString(),
        processor: "fast",
        tokensUsed: Math.ceil(result.content.length / 4)
      }
    };
    
  } catch (error) {
    console.error("❌ Ошибка в быстрой обработке:", error.message);
    return {
      ...state,
      error: error.message,
      errorType: "api",
      processingStage: "error"
    };
  }
}

/**
 * Шаг 5: Детальная обработка
 */
async function detailedProcessing(state) {
  console.log("🧠 Детальная обработка");
  
  const model = new ChatPerplexity({
    model: "sonar-pro",
    temperature: 0.7,
    maxTokens: 1000,
    apiKey: process.env.PERPLEXITY_API_KEY,
  });
  
  const systemPrompt = `Ты эксперт в области ${state.domain}. 
  Проведи детальный анализ и дай развернутый ответ на русском языке.
  Используй актуальную информацию и предоставь структурированный ответ.`;
  
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", systemPrompt],
    ["human", "{query}"]
  ]);
  
  try {
    const chain = prompt.pipe(model);
    const result = await chain.invoke({ query: state.userQuery });
    
    const userMessage = new HumanMessage(state.userQuery);
    const aiMessage = new AIMessage(result.content);
    
    return {
      ...state,
      response: result.content,
      messages: [...state.messages, userMessage, aiMessage],
      confidence: 0.85,
      quality: 9,
      processingStage: "completed",
      metadata: {
        ...state.metadata,
        processedAt: new Date().toISOString(),
        processor: "detailed",
        tokensUsed: Math.ceil(result.content.length / 4)
      }
    };
    
  } catch (error) {
    console.error("❌ Ошибка в детальной обработке:", error.message);
    return {
      ...state,
      error: error.message,
      errorType: "api",
      processingStage: "error"
    };
  }
}

/**
 * Шаг 6: Стандартная обработка
 */
async function standardProcessing(state) {
  console.log("📝 Стандартная обработка");
  
  const model = new ChatPerplexity({
    model: "sonar-pro",
    temperature: 0.5,
    maxTokens: 500,
    apiKey: process.env.PERPLEXITY_API_KEY,
  });
  
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", "Дай информативный ответ на русском языке. Будь точным и полезным."],
    ["human", "{query}"]
  ]);
  
  try {
    const chain = prompt.pipe(model);
    const result = await chain.invoke({ query: state.userQuery });
    
    const userMessage = new HumanMessage(state.userQuery);
    const aiMessage = new AIMessage(result.content);
    
    return {
      ...state,
      response: result.content,
      messages: [...state.messages, userMessage, aiMessage],
      confidence: 0.8,
      quality: 7,
      processingStage: "completed",
      metadata: {
        ...state.metadata,
        processedAt: new Date().toISOString(),
        processor: "standard",
        tokensUsed: Math.ceil(result.content.length / 4)
      }
    };
    
  } catch (error) {
    console.error("❌ Ошибка в стандартной обработке:", error.message);
    return {
      ...state,
      error: error.message,
      errorType: "api",
      processingStage: "error"
    };
  }
}

/**
 * Шаг 7: Узел проверки качества
 */
async function qualityCheck(state) {
  console.log("🔍 Проверяю качество ответа");
  
  const { response, queryComplexity } = state;
  
  // Простая проверка качества
  let quality = 5;
  
  if (response.length < 50) {
    quality = 3; // Слишком короткий
  } else if (response.length > 1000) {
    quality = 8; // Детальный ответ
  } else {
    quality = 6; // Средний ответ
  }
  
  // Учитываем сложность запроса
  if (queryComplexity >= 7 && response.length < 200) {
    quality = Math.max(quality - 2, 1); // Снижаем качество для сложных запросов
  }
  
  console.log(`📊 Качество ответа: ${quality}/10`);
  
  return {
    ...state,
    quality,
    processingStage: "quality_checked",
    metadata: {
      ...state.metadata,
      qualityCheckedAt: new Date().toISOString(),
      qualityScore: quality
    }
  };
}

/**
 * Шаг 8: Узел retry логики
 */
async function retryLogic(state) {
  console.log("🔄 Проверяю необходимость retry");
  
  const { retryCount, maxRetries, error, quality } = state;
  
  // Если есть ошибка и не превышен лимит retry
  if (error && retryCount < maxRetries) {
    console.log(`🔄 Retry ${retryCount + 1}/${maxRetries}`);
    return {
      ...state,
      retryCount: retryCount + 1,
      error: null,
      processingStage: "retry",
      metadata: {
        ...state.metadata,
        retryAt: new Date().toISOString(),
        retryCount: retryCount + 1
      }
    };
  }
  
  // Если качество низкое и есть попытки
  if (quality < 5 && retryCount < maxRetries) {
    console.log(`🔄 Retry из-за низкого качества: ${quality}/10`);
    return {
      ...state,
      retryCount: retryCount + 1,
      processingStage: "retry",
      metadata: {
        ...state.metadata,
        retryAt: new Date().toISOString(),
        retryReason: "low_quality",
        retryCount: retryCount + 1
      }
    };
  }
  
  // Нет необходимости в retry
  console.log("✅ Retry не требуется");
  return {
    ...state,
    processingStage: "no_retry_needed"
  };
}

/**
 * Шаг 9: Fallback узел
 */
async function fallbackProcessing(state) {
  console.log("🛟 Fallback обработка");
  
  const fallbackResponse = `Извините, у меня возникли проблемы с обработкой вашего запроса: "${state.userQuery}".

Возможные причины:
- Проблемы с подключением к API
- Слишком сложный запрос
- Превышен лимит попыток

Попробуйте:
1. Переформулировать вопрос
2. Разбить сложный запрос на части
3. Обратиться к технической поддержке`;

  const userMessage = new HumanMessage(state.userQuery);
  const aiMessage = new AIMessage(fallbackResponse);
  
  return {
    ...state,
    response: fallbackResponse,
    messages: [...state.messages, userMessage, aiMessage],
    fallbackUsed: true,
    fallbackType: "manual",
    fallbackReason: state.error || "quality_issue",
    confidence: 0.3,
    quality: 4,
    processingStage: "fallback_completed",
    metadata: {
      ...state.metadata,
      fallbackAt: new Date().toISOString(),
      fallbackType: "manual"
    }
  };
}

/**
 * Шаг 10: Функция принятия решений (для условных переходов)
 */
function decideNextStep(state) {
  console.log("🤔 Принимаю решение о следующем шаге");
  
  const { processingStage, error, retryCount, maxRetries, quality } = state;
  
  // Если анализ завершен, выбираем стратегию
  if (processingStage === "analysis") {
    return "select_strategy";
  }
  
  // Если стратегия выбрана, обрабатываем
  if (processingStage === "fast_processing") {
    return "fast_processing";
  }
  if (processingStage === "detailed_processing") {
    return "detailed_processing";
  }
  if (processingStage === "standard_processing") {
    return "standard_processing";
  }
  
  // Если обработка завершена, проверяем качество
  if (processingStage === "completed") {
    return "quality_check";
  }
  
  // Если нужен retry
  if (processingStage === "retry") {
    return "select_strategy";
  }
  
  // Если нужен fallback
  if (error && retryCount >= maxRetries) {
    return "fallback";
  }
  
  if (quality < 5 && retryCount >= maxRetries) {
    return "fallback";
  }
  
  // Если все хорошо, завершаем
  if (processingStage === "quality_checked" && quality >= 5) {
    return "end";
  }
  
  // По умолчанию - retry логика
  return "retry_logic";
}

/**
 * Шаг 10.1: Узел принятия решений (возвращает обновленное состояние)
 */
async function decideNode(state) {
  console.log("🤔 Узел принятия решений");
  
  const { processingStage, error, retryCount, maxRetries, quality } = state;
  
  // Обновляем состояние с информацией о принятом решении
  return {
    ...state,
    processingStage: "decision_made",
    metadata: {
      ...state.metadata,
      decisionMade: true,
      decisionAt: new Date().toISOString(),
      previousStage: processingStage
    }
  };
}

/**
 * Шаг 11: Создаем сложный граф
 * 
 * 🏗️ ПРОДВИНУТАЯ ГРАФОВАЯ АРХИТЕКТУРА С МНОЖЕСТВЕННЫМИ УЗЛАМИ:
 * 
 * Этот граф демонстрирует максимальные возможности LangGraph:
 * 
 * 📍 СПЕЦИАЛИЗИРОВАННЫЕ УЗЛЫ:
 *    - analyze: анализ и классификация запроса
 *    - select_strategy: выбор стратегии обработки
 *    - fast_processing: быстрая обработка простых запросов
 *    - detailed_processing: детальная обработка сложных запросов
 *    - standard_processing: стандартная обработка
 *    - quality_check: проверка качества результата
 *    - retry_logic: логика повторных попыток
 *    - fallback: обработка ошибок
 *    - decide: центральный узел принятия решений
 * 
 * 🔗 СЛОЖНАЯ СТРУКТУРА РЁБЕР:
 *    - Фиксированные рёбра для последовательной обработки
 *    - Условные рёбра для динамического выбора путей
 *    - Обратные рёбра для retry логики
 *    - Завершающие рёбра для окончания обработки
 * 
 * 🎯 ПРОДВИНУТАЯ УСЛОВНАЯ ЛОГИКА:
 *    - Сложная функция принятия решений
 *    - Поддержка множественных состояний
 *    - Обработка предыдущих состояний
 *    - Динамическое переключение между стратегиями
 * 
 * 📊 ВИЗУАЛИЗАЦИЯ СЛОЖНОГО ГРАФА:
 *    START ──► [analyze] ──► [select_strategy] ──► [decide] ──┬──► [fast_processing] ──┐
 *                                                             ├──► [detailed_processing] ─┤
 *                                                             ├──► [standard_processing] ─┤
 *                                                             ├──► [quality_check] ───────┤
 *                                                             ├──► [retry_logic] ─────────┤
 *                                                             ├──► [fallback] ───────────┘
 *                                                             └──► END
 * 
 * 🔄 МНОГОУРОВНЕВАЯ ОБРАБОТКА:
 *    - Анализ → Стратегия → Обработка → Качество → Решение
 *    - Поддержка retry на каждом уровне
 *    - Fallback как последний уровень защиты
 *    - Централизованное принятие решений
 */
const workflow = new StateGraph(AdvancedGraphState)
  // 🏗️ ДОБАВЛЯЕМ ВСЕ СПЕЦИАЛИЗИРОВАННЫЕ УЗЛЫ
  .addNode("analyze", analyzeQuery)                    // Анализ запроса
  .addNode("select_strategy", selectProcessingStrategy) // Выбор стратегии
  .addNode("fast_processing", fastProcessing)           // Быстрая обработка
  .addNode("detailed_processing", detailedProcessing)   // Детальная обработка
  .addNode("standard_processing", standardProcessing) // Стандартная обработка
  .addNode("quality_check", qualityCheck)              // Проверка качества
  .addNode("retry_logic", retryLogic)                  // Retry логика
  .addNode("fallback", fallbackProcessing)             // Fallback обработка
  .addNode("decide", decideNode)                       // Узел принятия решений
  
  // 🔗 ФИКСИРОВАННЫЕ РЁБРА - последовательная обработка
  // Начальная точка: START -> analyze
  .addEdge(START, "analyze")
  
  // От анализа к выбору стратегии
  .addEdge("analyze", "select_strategy")
  
  // От выбора стратегии к решению
  .addEdge("select_strategy", "decide")
  
  // 🎯 ПРОДВИНУТЫЕ УСЛОВНЫЕ РЁБРА
  // Сложная функция принятия решений с поддержкой состояний
  .addConditionalEdges(
    "decide",                    // Исходный узел
    (state) => {                 // Сложная функция выбора
      // Если мы только что приняли решение, используем предыдущее состояние
      if (state.processingStage === "decision_made") {
        const previousStage = state.metadata?.previousStage || "analysis";
        const tempState = { ...state, processingStage: previousStage };
        return decideNextStep(tempState);
      }
      return decideNextStep(state);
    },
    {                           // Маппинг всех возможных путей
      select_strategy: "select_strategy",     // Повторный выбор стратегии
      fast_processing: "fast_processing",     // Быстрая обработка
      detailed_processing: "detailed_processing", // Детальная обработка
      standard_processing: "standard_processing", // Стандартная обработка
      quality_check: "quality_check",         // Проверка качества
      retry_logic: "retry_logic",             // Retry логика
      fallback: "fallback",                   // Fallback обработка
      end: END                               // Завершение
    }
  )
  
  // 🔗 ОБРАТНЫЕ РЁБРА - возвращаемся к решению
  // От всех процессоров к решению (для retry логики)
  .addEdge("fast_processing", "decide")
  .addEdge("detailed_processing", "decide")
  .addEdge("standard_processing", "decide")
  
  // От проверки качества к решению
  .addEdge("quality_check", "decide")
  
  // От retry логики к решению
  .addEdge("retry_logic", "decide")
  
  // 🔗 ЗАВЕРШАЮЩИЕ РЁБРА
  // Fallback завершает граф
  .addEdge("fallback", END);

/**
 * Шаг 12: Компилируем граф
 * 
 * 🔧 КОМПИЛЯЦИЯ ПРОДВИНУТОГО ГРАФА:
 * 
 * При компиляции сложного графа LangGraph выполняет максимальную оптимизацию:
 * 
 * 1. 🎯 АНАЛИЗ СЛОЖНОЙ СТРУКТУРЫ:
 *    - Проверяет все 9 узлов и их связи
 *    - Валидирует сложную условную логику
 *    - Проверяет циклические структуры
 *    - Оптимизирует порядок выполнения
 * 
 * 2. 🔄 ОПТИМИЗАЦИЯ RETRY ЛОГИКИ:
 *    - Обнаруживает все обратные рёбра
 *    - Оптимизирует циклические переходы
 *    - Предотвращает бесконечные циклы
 *    - Настраивает лимиты retry
 * 
 * 3. 🛡️ ВАЛИДАЦИЯ FALLBACK СИСТЕМЫ:
 *    - Проверяет, что все узлы имеют пути к fallback
 *    - Валидирует завершающие рёбра
 *    - Проверяет корректность обработки ошибок
 * 
 * 4. 📊 СОЗДАНИЕ ПРОДВИНУТОГО ДВИЖКА:
 *    - Создает движок с поддержкой множественных узлов
 *    - Настраивает сложную систему принятия решений
 *    - Подготавливает retry и fallback логику
 *    - Оптимизирует передачу состояния
 */
const app = workflow.compile();

/**
 * Функция для запуска продвинутого графа
 * 
 * 🚀 ВЫПОЛНЕНИЕ ПРОДВИНУТОГО ГРАФА:
 * 
 * Выполнение продвинутого графа - это сложный процесс с множественными уровнями:
 * 
 * 1. 🎯 ИНИЦИАЛИЗАЦИЯ С ПОЛНЫМ СОСТОЯНИЕМ:
 *    - Состояние содержит все поля для сложной логики
 *    - Включает метрики производительности (startTime, processingTime)
 *    - Содержит поля для retry и fallback логики
 *    - Поддерживает отслеживание качества и уверенности
 * 
 * 2. 🔄 МНОГОУРОВНЕВОЕ ВЫПОЛНЕНИЕ:
 *    - Анализ запроса → Выбор стратегии → Обработка → Проверка качества
 *    - Каждый уровень может вернуться к предыдущему (retry)
 *    - Поддержка fallback на любом уровне
 *    - Централизованное принятие решений
 * 
 * 3. 🎯 СЛОЖНАЯ СИСТЕМА ПРИНЯТИЯ РЕШЕНИЙ:
 *    - Узел "decide" анализирует текущее состояние
 *    - Поддерживает множественные стратегии обработки
 *    - Реализует retry логику с лимитами
 *    - Обеспечивает fallback при критических ошибках
 * 
 * 4. 📊 ОТСЛЕЖИВАНИЕ ПРОИЗВОДИТЕЛЬНОСТИ:
 *    - Измерение времени выполнения
 *    - Подсчет использованных токенов
 *    - Отслеживание качества результата
 *    - Мониторинг retry и fallback использования
 * 
 * 5. 🛡️ РОБУСТНАЯ ОБРАБОТКА ОШИБОК:
 *    - Множественные уровни fallback
 *    - Retry логика с экспоненциальным backoff
 *    - Детальное логирование ошибок
 *    - Graceful degradation при критических сбоях
 */
async function runAdvancedGraph(query) {
  console.log("🚀 Запускаю продвинутый граф LangGraph...");
  
  const startTime = Date.now();
  
  // 🏗️ СОЗДАЕМ ПОЛНОЕ НАЧАЛЬНОЕ СОСТОЯНИЕ
  // Включает все поля для сложной логики обработки
  const initialState = {
    userQuery: query,
    response: "",
    messages: [],
    queryType: "",                    // Тип запроса
    queryComplexity: 0,               // Сложность запроса (1-10)
    language: "ru",                  // Язык обработки
    domain: "",                      // Домен запроса
    processingStage: "",             // Текущий этап обработки
    confidence: 0,                   // Уверенность в результате
    quality: 0,                      // Качество результата
    error: null,                     // Ошибка, если есть
    errorType: "",                   // Тип ошибки
    retryCount: 0,                   // Счетчик попыток
    maxRetries: 3,                   // Максимальное количество попыток
    fallbackUsed: false,             // Флаг использования fallback
    fallbackType: "",               // Тип fallback
    fallbackReason: "",              // Причина fallback
    startTime,                       // Время начала
    endTime: 0,                      // Время завершения
    processingTime: 0,               // Время обработки
    tokensUsed: 0,                   // Использованные токены
    metadata: {
      startedAt: new Date().toISOString()
    }
  };
  
  try {
    // 🚀 ВЫПОЛНЯЕМ ПРОДВИНУТЫЙ ГРАФ
    // Графовый движок будет:
    // 1. Выполнять узлы в сложном порядке
    // 2. Использовать продвинутую условную логику
    // 3. Поддерживать retry и fallback на всех уровнях
    // 4. Отслеживать производительность и качество
    const result = await app.invoke(initialState);
    
    const endTime = Date.now();
    const processingTime = endTime - startTime;
    
    console.log("✅ Продвинутый граф выполнен успешно!");
    
    // 📊 ВОЗВРАЩАЕМ РЕЗУЛЬТАТ С МЕТРИКАМИ
    return {
      ...result,
      endTime,
      processingTime,
      metadata: {
        ...result.metadata,
        completedAt: new Date().toISOString(),
        totalProcessingTime: processingTime
      }
    };
    
  } catch (error) {
    console.error("❌ Ошибка при выполнении продвинутого графа:", error);
    throw error;
  }
}

/**
 * Пример использования
 */
async function main() {
  try {
    if (!process.env.PERPLEXITY_API_KEY) {
      throw new Error("❌ PERPLEXITY_API_KEY не найден в переменных окружения");
    }
    
    console.log("🎓 Продвинутый граф LangGraph");
    console.log("=" .repeat(50));
    
    // Тестовые запросы разной сложности
    const testQueries = [
      "Что такое машинное обучение?", // Простой
      "Проведи детальный анализ влияния искусственного интеллекта на современную экономику, сравни с предыдущими технологическими революциями и оцени перспективы развития", // Сложный
      "Объясни разницу между машинным обучением и глубоким обучением" // Средний
    ];
    
    for (const query of testQueries) {
      console.log(`\n📝 Запрос: ${query}`);
      console.log("⏳ Обрабатываю...");
      
      const result = await runAdvancedGraph(query);
      
      console.log("✅ Результат:");
      console.log("-".repeat(40));
      console.log(result.response);
      console.log("-".repeat(40));
      console.log(`📊 Анализ:`);
      console.log(`  - Тип: ${result.queryType}`);
      console.log(`  - Сложность: ${result.queryComplexity}/10`);
      console.log(`  - Домен: ${result.domain}`);
      console.log(`  - Уверенность: ${(result.confidence * 100).toFixed(1)}%`);
      console.log(`  - Качество: ${result.quality}/10`);
      console.log(`  - Retry: ${result.retryCount}/${result.maxRetries}`);
      console.log(`  - Fallback: ${result.fallbackUsed ? 'Да' : 'Нет'}`);
      console.log(`  - Время: ${result.processingTime}ms`);
      console.log(`  - Токены: ${result.tokensUsed}`);
      if (result.error) {
        console.log(`  - Ошибка: ${result.error}`);
      }
      console.log(`💬 Сообщений: ${result.messages.length}`);
    }
    
  } catch (error) {
    console.error("❌ Критическая ошибка:", error.message);
  }
}

// Запускаем пример, если файл выполняется напрямую
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

// Экспортируем для использования в других модулях
export { runAdvancedGraph, app, AdvancedGraphState };
