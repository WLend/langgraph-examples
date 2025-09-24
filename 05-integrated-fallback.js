/**
 * 🔗 Уровень 5: Интегрированный Fallback в существующий граф
 * 
 * Этот пример демонстрирует:
 * - Интеграцию fallback в существующий продвинутый граф
 * - Умные стратегии fallback на основе контекста
 * - Каскадные fallback механизмы
 * - Мониторинг и аналитику fallback
 * 
 * Время изучения: 45-60 минут
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
 * Шаг 1: Расширенное состояние с интегрированным fallback
 */
const IntegratedFallbackState = z.object({
  // Основные поля
  userQuery: z.string().default(""),
  response: z.string().default(""),
  messages: z.array(z.any()).default([]),
  
  // Анализ запроса
  queryType: z.string().default(""),
  queryComplexity: z.number().default(0),
  domain: z.string().default(""),
  
  // Обработка
  processingStage: z.string().default(""),
  confidence: z.number().default(0),
  quality: z.number().default(0),
  
  // Ошибки и fallback
  error: z.string().nullable().default(null),
  errorType: z.string().default(""),
  retryCount: z.number().default(0),
  maxRetries: z.number().default(3),
  
  // Интегрированный fallback
  fallbackUsed: z.boolean().default(false),
  fallbackType: z.string().default(""),
  fallbackReason: z.string().default(""),
  fallbackLevel: z.number().default(0), // 1-3 уровни fallback
  fallbackSuccess: z.boolean().default(false),
  
  // Кэш и альтернативы
  cachedResponses: z.record(z.string()).default({}),
  alternativeModels: z.array(z.string()).default([]),
  
  // Мониторинг
  startTime: z.number().default(0),
  processingTime: z.number().default(0),
  fallbackMetrics: z.record(z.any()).default({}),
  
  // Метаданные
  metadata: z.record(z.any()).default({})
});

/**
 * Шаг 2: Узел анализа запроса (из продвинутого графа)
 */
async function analyzeQuery(state) {
  console.log("🔍 Анализирую запрос:", state.userQuery);
  
  const query = state.userQuery.toLowerCase();
  
  let complexity = 1;
  if (query.length > 200) complexity += 2;
  if (query.includes("анализ") || query.includes("сравни")) complexity += 2;
  if (query.includes("объясни подробно")) complexity += 3;
  if (query.includes("научный") || query.includes("исследование")) complexity += 2;
  
  let domain = "general";
  if (query.includes("программирование") || query.includes("код")) {
    domain = "tech";
  } else if (query.includes("наука") || query.includes("исследование")) {
    domain = "science";
  } else if (query.includes("бизнес") || query.includes("экономика")) {
    domain = "business";
  }
  
  let queryType = "general";
  if (query.includes("что такое") || query.includes("кто такой")) {
    queryType = "definition";
  } else if (query.includes("как") || query.includes("почему")) {
    queryType = "explanation";
  } else if (query.includes("сравни") || query.includes("разница")) {
    queryType = "comparison";
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
 * Шаг 3: Основная обработка с встроенной обработкой ошибок
 */
async function mainProcessing(state) {
  console.log("⚡ Основная обработка");
  
  try {
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
    
    const chain = prompt.pipe(model);
    const result = await chain.invoke({ query: state.userQuery });
    
    const userMessage = new HumanMessage(state.userQuery);
    const aiMessage = new AIMessage(result.content);
    
    console.log("✅ Основная обработка успешна");
    
    return {
      ...state,
      response: result.content,
      messages: [...state.messages, userMessage, aiMessage],
      confidence: 0.9,
      quality: 8,
      processingStage: "main_completed",
      metadata: {
        ...state.metadata,
        processedAt: new Date().toISOString(),
        processor: "main",
        tokensUsed: Math.ceil(result.content.length / 4)
      }
    };
    
  } catch (error) {
    console.error("❌ Ошибка в основной обработке:", error.message);
    
    // Определяем тип ошибки
    let errorType = "unknown";
    if (error.message.includes("timeout")) errorType = "timeout";
    else if (error.message.includes("rate limit")) errorType = "rate_limit";
    else if (error.message.includes("network")) errorType = "network";
    else if (error.message.includes("api")) errorType = "api";
    
    return {
      ...state,
      error: error.message,
      errorType,
      processingStage: "main_failed",
      metadata: {
        ...state.metadata,
        errorAt: new Date().toISOString(),
        errorType,
        mainProcessingFailed: true
      }
    };
  }
}

/**
 * Шаг 4: Fallback Level 1 - Кэшированные ответы
 */
async function fallbackLevel1(state) {
  console.log("🛟 Fallback Level 1: Кэшированные ответы");
  
  const { userQuery, cachedResponses, queryType, domain } = state;
  
  // Ищем точное совпадение
  let cachedResponse = cachedResponses[userQuery.toLowerCase().trim()];
  
  if (!cachedResponse) {
    // Ищем по типу запроса
    const typeKey = `type_${queryType}`;
    cachedResponse = cachedResponses[typeKey];
  }
  
  if (!cachedResponse) {
    // Ищем по домену
    const domainKey = `domain_${domain}`;
    cachedResponse = cachedResponses[domainKey];
  }
  
  if (cachedResponse) {
    console.log("✅ Найден кэшированный ответ");
    const userMessage = new HumanMessage(userQuery);
    const aiMessage = new AIMessage(cachedResponse);
    
    return {
      ...state,
      response: cachedResponse,
      messages: [...state.messages, userMessage, aiMessage],
      fallbackUsed: true,
      fallbackType: "cached",
      fallbackLevel: 1,
      fallbackSuccess: true,
      confidence: 0.7,
      quality: 6,
      processingStage: "fallback_level1_success",
      metadata: {
        ...state.metadata,
        fallbackAt: new Date().toISOString(),
        fallbackLevel: 1,
        cacheHit: true
      }
    };
  }
  
  console.log("❌ Кэш не найден, переходим к Level 2");
  return {
    ...state,
    fallbackLevel: 1,
    fallbackSuccess: false,
    processingStage: "fallback_level1_failed",
    metadata: {
      ...state.metadata,
      fallbackLevel: 1,
      cacheMiss: true
    }
  };
}

/**
 * Шаг 5: Fallback Level 2 - Альтернативная модель
 */
async function fallbackLevel2(state) {
  console.log("🛟 Fallback Level 2: Альтернативная модель");
  
  try {
    // Используем другую модель или параметры
    const model = new ChatPerplexity({
      model: "sonar-pro", // Можно попробовать другую модель
      temperature: 0.3, // Более консервативные параметры
      maxTokens: 300, // Меньше токенов
      apiKey: process.env.PERPLEXITY_API_KEY,
    });
    
    const prompt = ChatPromptTemplate.fromMessages([
      ["system", "Дай краткий и точный ответ на русском языке. Если не уверен, скажи об этом."],
      ["human", "{query}"]
    ]);
    
    const chain = prompt.pipe(model);
    const result = await chain.invoke({ query: state.userQuery });
    
    const userMessage = new HumanMessage(state.userQuery);
    const aiMessage = new AIMessage(result.content);
    
    console.log("✅ Альтернативная модель успешна");
    
    return {
      ...state,
      response: result.content,
      messages: [...state.messages, userMessage, aiMessage],
      fallbackUsed: true,
      fallbackType: "alternative_model",
      fallbackLevel: 2,
      fallbackSuccess: true,
      confidence: 0.6,
      quality: 5,
      processingStage: "fallback_level2_success",
      metadata: {
        ...state.metadata,
        fallbackAt: new Date().toISOString(),
        fallbackLevel: 2,
        alternativeModelUsed: true
      }
    };
    
  } catch (error) {
    console.error("❌ Альтернативная модель тоже не работает:", error.message);
    return {
      ...state,
      fallbackLevel: 2,
      fallbackSuccess: false,
      processingStage: "fallback_level2_failed",
      metadata: {
        ...state.metadata,
        fallbackLevel: 2,
        alternativeModelFailed: true,
        alternativeModelError: error.message
      }
    };
  }
}

/**
 * Шаг 6: Fallback Level 3 - Локальная обработка
 */
async function fallbackLevel3(state) {
  console.log("🛟 Fallback Level 3: Локальная обработка");
  
  const { userQuery, queryType, domain } = state;
  
  let localResponse = "";
  
  // Специализированная обработка по типу запроса
  if (queryType === "definition") {
    localResponse = `К сожалению, у меня сейчас технические проблемы, и я не могу дать точное определение для "${userQuery}". Попробуйте обратиться позже или переформулировать вопрос.`;
  } else if (queryType === "explanation") {
    localResponse = `Я получил ваш запрос: "${userQuery}", но у меня сейчас ограниченные возможности. Я не могу дать полное объяснение, но запомнил ваш вопрос.`;
  } else if (queryType === "comparison") {
    localResponse = `Для сравнения "${userQuery}" мне нужен доступ к актуальным данным, которого сейчас нет. Попробуйте обратиться позже.`;
  } else {
    localResponse = `Я получил ваш запрос: "${userQuery}", но у меня сейчас технические проблемы. Я не могу дать полный ответ, но запомнил ваш вопрос для будущего обращения.`;
  }
  
  // Добавляем контекстную информацию
  if (domain === "tech") {
    localResponse += "\n\n💡 Совет: Для технических вопросов попробуйте обратиться к официальной документации или сообществу разработчиков.";
  } else if (domain === "science") {
    localResponse += "\n\n🔬 Совет: Для научных вопросов рекомендую обратиться к научным статьям или экспертам в данной области.";
  } else if (domain === "business") {
    localResponse += "\n\n💼 Совет: Для бизнес-вопросов рекомендую обратиться к бизнес-консультантам или специализированным ресурсам.";
  }
  
  const userMessage = new HumanMessage(userQuery);
  const aiMessage = new AIMessage(localResponse);
  
  return {
    ...state,
    response: localResponse,
    messages: [...state.messages, userMessage, aiMessage],
    fallbackUsed: true,
    fallbackType: "local_processing",
    fallbackLevel: 3,
    fallbackSuccess: true,
    confidence: 0.4,
    quality: 4,
    processingStage: "fallback_level3_success",
    metadata: {
      ...state.metadata,
      fallbackAt: new Date().toISOString(),
      fallbackLevel: 3,
      localProcessing: true
    }
  };
}

/**
 * Шаг 7: Узел выбора fallback стратегии
 */
async function selectFallbackStrategy(state) {
  console.log("🎯 Выбираю fallback стратегию");
  
  const { errorType, queryComplexity, domain, fallbackLevel } = state;
  
  // Если это первый fallback
  if (fallbackLevel === 0) {
    console.log("🛟 Начинаем с Level 1 (кэш)");
    return {
      ...state,
      fallbackLevel: 1,
      processingStage: "fallback_level1",
      metadata: {
        ...state.metadata,
        fallbackStrategy: "level1",
        strategySelectedAt: new Date().toISOString()
      }
    };
  }
  
  // Если Level 1 не сработал
  if (fallbackLevel === 1 && !state.fallbackSuccess) {
    console.log("🛟 Переходим к Level 2 (альтернативная модель)");
    return {
      ...state,
      fallbackLevel: 2,
      processingStage: "fallback_level2",
      metadata: {
        ...state.metadata,
        fallbackStrategy: "level2",
        strategySelectedAt: new Date().toISOString()
      }
    };
  }
  
  // Если Level 2 не сработал
  if (fallbackLevel === 2 && !state.fallbackSuccess) {
    console.log("🛟 Переходим к Level 3 (локальная обработка)");
    return {
      ...state,
      fallbackLevel: 3,
      processingStage: "fallback_level3",
      metadata: {
        ...state.metadata,
        fallbackStrategy: "level3",
        strategySelectedAt: new Date().toISOString()
      }
    };
  }
  
  // Если все fallback исчерпаны
  console.log("❌ Все fallback стратегии исчерпаны");
  return {
    ...state,
    processingStage: "all_fallback_failed",
    metadata: {
      ...state.metadata,
      allFallbackFailed: true,
      failedAt: new Date().toISOString()
    }
  };
}

/**
 * Шаг 8: Функция принятия решений
 */
function decideNextStep(state) {
  console.log("🤔 Принимаю решение о следующем шаге");
  
  const { processingStage, error, fallbackLevel, fallbackSuccess } = state;
  
  // Если анализ завершен, переходим к основной обработке
  if (processingStage === "analysis") {
    return "main_processing";
  }
  
  // Если основная обработка завершена успешно
  if (processingStage === "main_completed") {
    return "end";
  }
  
  // Если основная обработка не удалась, переходим к fallback
  if (processingStage === "main_failed") {
    return "select_fallback_strategy";
  }
  
  // Если fallback стратегия выбрана
  if (processingStage === "fallback_level1") {
    return "fallback_level1";
  }
  if (processingStage === "fallback_level2") {
    return "fallback_level2";
  }
  if (processingStage === "fallback_level3") {
    return "fallback_level3";
  }
  
  // Если fallback успешен
  if (processingStage.includes("fallback_level") && processingStage.includes("success")) {
    return "end";
  }
  
  // Если fallback не удался, переходим к следующему уровню
  if (processingStage.includes("fallback_level") && processingStage.includes("failed")) {
    return "select_fallback_strategy";
  }
  
  // Если все fallback исчерпаны
  if (processingStage === "all_fallback_failed") {
    return "end";
  }
  
  // По умолчанию - fallback
  return "select_fallback_strategy";
}

/**
 * Шаг 9: Создаем интегрированный граф
 */
const integratedWorkflow = new StateGraph(IntegratedFallbackState)
  // Добавляем узлы
  .addNode("analyze", analyzeQuery)
  .addNode("main_processing", mainProcessing)
  .addNode("select_fallback_strategy", selectFallbackStrategy)
  .addNode("fallback_level1", fallbackLevel1)
  .addNode("fallback_level2", fallbackLevel2)
  .addNode("fallback_level3", fallbackLevel3)
  
  // Начальная точка
  .addEdge(START, "analyze")
  
  // От анализа к основной обработке
  .addEdge("analyze", "main_processing")
  
  // Условные переходы от основной обработки
  .addConditionalEdges(
    "main_processing",
    (state) => {
      if (state.processingStage === "main_completed") {
        return "end";
      } else {
        return "select_fallback_strategy";
      }
    },
    {
      end: END,
      select_fallback_strategy: "select_fallback_strategy"
    }
  )
  
  // Условные переходы от выбора fallback стратегии
  .addConditionalEdges(
    "select_fallback_strategy",
    (state) => {
      if (state.processingStage === "fallback_level1") {
        return "fallback_level1";
      } else if (state.processingStage === "fallback_level2") {
        return "fallback_level2";
      } else if (state.processingStage === "fallback_level3") {
        return "fallback_level3";
      } else {
        return "end";
      }
    },
    {
      fallback_level1: "fallback_level1",
      fallback_level2: "fallback_level2",
      fallback_level3: "fallback_level3",
      end: END
    }
  )
  
  // Условные переходы от fallback узлов
  .addConditionalEdges(
    "fallback_level1",
    (state) => {
      if (state.processingStage.includes("success")) {
        return "end";
      } else {
        return "select_fallback_strategy";
      }
    },
    {
      end: END,
      select_fallback_strategy: "select_fallback_strategy"
    }
  )
  
  .addConditionalEdges(
    "fallback_level2",
    (state) => {
      if (state.processingStage.includes("success")) {
        return "end";
      } else {
        return "select_fallback_strategy";
      }
    },
    {
      end: END,
      select_fallback_strategy: "select_fallback_strategy"
    }
  )
  
  .addConditionalEdges(
    "fallback_level3",
    (state) => {
      return "end";
    },
    {
      end: END
    }
  );

/**
 * Шаг 10: Компилируем граф
 */
const integratedApp = integratedWorkflow.compile();

/**
 * Функция для добавления кэшированных ответов
 */
function addCachedResponses(state, responses) {
  return {
    ...state,
    cachedResponses: {
      ...state.cachedResponses,
      ...responses
    }
  };
}

/**
 * Функция для запуска интегрированного графа
 */
async function runIntegratedFallback(query, options = {}) {
  console.log("🔗 Запускаю интегрированный fallback граф...");
  
  const startTime = Date.now();
  
  const initialState = {
    userQuery: query,
    response: "",
    messages: [],
    queryType: "",
    queryComplexity: 0,
    domain: "",
    processingStage: "",
    confidence: 0,
    quality: 0,
    error: null,
    errorType: "",
    retryCount: 0,
    maxRetries: options.maxRetries || 3,
    fallbackUsed: false,
    fallbackType: "",
    fallbackReason: "",
    fallbackLevel: 0,
    fallbackSuccess: false,
    cachedResponses: options.cachedResponses || {},
    alternativeModels: options.alternativeModels || [],
    startTime,
    processingTime: 0,
    fallbackMetrics: {},
    metadata: {
      startedAt: new Date().toISOString(),
      options
    }
  };
  
  try {
    const result = await integratedApp.invoke(initialState);
    
    const endTime = Date.now();
    const processingTime = endTime - startTime;
    
    console.log("✅ Интегрированный граф выполнен!");
    
    return {
      ...result,
      processingTime,
      metadata: {
        ...result.metadata,
        completedAt: new Date().toISOString(),
        totalProcessingTime: processingTime
      }
    };
    
  } catch (error) {
    console.error("❌ Ошибка при выполнении интегрированного графа:", error);
    throw error;
  }
}

/**
 * Пример использования
 */
async function main() {
  try {
    console.log("🔗 Интегрированный Fallback в LangGraph");
    console.log("=" .repeat(50));
    
    // Предварительно заполняем кэш
    const cachedResponses = {
      "что такое машинное обучение": "Машинное обучение - это область искусственного интеллекта, которая позволяет компьютерам учиться и принимать решения без явного программирования.",
      "type_definition": "Определение - это точное объяснение значения термина или понятия.",
      "domain_tech": "Техническая информация о программировании, разработке и IT-технологиях.",
      "domain_science": "Научная информация о исследованиях, экспериментах и научных открытиях."
    };
    
    // Тестовые запросы
    const testQueries = [
      "Что такое машинное обучение?", // Должен найти в кэше
      "Объясни квантовую физику", // Не найдет в кэше, пойдет в альтернативную модель
      "Сравни React и Vue", // Не найдет в кэше, пойдет в локальную обработку
      "Расскажи про блокчейн" // Не найдет в кэше, пойдет в локальную обработку
    ];
    
    for (const query of testQueries) {
      console.log(`\n📝 Запрос: ${query}`);
      console.log("⏳ Обрабатываю с интегрированным fallback...");
      
      const result = await runIntegratedFallback(query, { 
        cachedResponses,
        maxRetries: 2 
      });
      
      console.log("✅ Результат:");
      console.log("-".repeat(40));
      console.log(result.response);
      console.log("-".repeat(40));
      console.log(`📊 Анализ:`);
      console.log(`  - Тип: ${result.queryType}`);
      console.log(`  - Сложность: ${result.queryComplexity}/10`);
      console.log(`  - Домен: ${result.domain}`);
      console.log(`  - Fallback использован: ${result.fallbackUsed ? 'Да' : 'Нет'}`);
      console.log(`  - Уровень fallback: ${result.fallbackLevel}`);
      console.log(`  - Тип fallback: ${result.fallbackType || 'Нет'}`);
      console.log(`  - Успех fallback: ${result.fallbackSuccess ? 'Да' : 'Нет'}`);
      console.log(`  - Уверенность: ${(result.confidence * 100).toFixed(1)}%`);
      console.log(`  - Качество: ${result.quality}/10`);
      console.log(`  - Время: ${result.processingTime}ms`);
      if (result.error) {
        console.log(`  - Ошибка: ${result.error}`);
      }
      console.log(`💬 Сообщений: ${result.messages.length}`);
      console.log(`🔍 Метаданные:`, result.metadata);
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
export { runIntegratedFallback, integratedApp, IntegratedFallbackState, addCachedResponses };
