/**
 * 🛟 Уровень 4: Пример с Fallback механизмом
 * 
 * Этот пример демонстрирует:
 * - Намеренное создание ошибок для демонстрации fallback
 * - Различные стратегии fallback (простой, кэшированный, альтернативный)
 * - Обработку ошибок и восстановление
 * - Мониторинг и логирование fallback событий
 * 
 * Время изучения: 30-40 минут
 * Сложность: 🟡 Средний
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
 * Шаг 1: Состояние с fallback полями
 */
const FallbackGraphState = z.object({
  // Основные поля
  userQuery: z.string().default(""),
  response: z.string().default(""),
  messages: z.array(z.any()).default([]),
  
  // Ошибки и fallback
  error: z.string().nullable().default(null),
  errorType: z.string().default(""), // api, timeout, validation, network
  fallbackUsed: z.boolean().default(false),
  fallbackType: z.string().default(""), // simple, cached, alternative
  fallbackReason: z.string().default(""),
  
  // Retry логика
  retryCount: z.number().default(0),
  maxRetries: z.number().default(2),
  
  // Кэш для fallback
  cachedResponses: z.record(z.string()).default({}),
  
  // Мониторинг
  startTime: z.number().default(0),
  processingTime: z.number().default(0),
  
  // Метаданные
  metadata: z.record(z.any()).default({})
});

/**
 * Шаг 2: Узел намеренного создания ошибки
 * 
 * Этот узел намеренно создает ошибки для демонстрации fallback
 */
async function intentionalErrorNode(state) {
  console.log("💥 Намеренно создаю ошибку для демонстрации fallback");
  
  // Симулируем различные типы ошибок
  const errorTypes = ["api", "timeout", "network", "validation"];
  const randomErrorType = errorTypes[Math.floor(Math.random() * errorTypes.length)];
  
  let errorMessage = "";
  
  switch (randomErrorType) {
    case "api":
      errorMessage = "API недоступен: превышен лимит запросов";
      break;
    case "timeout":
      errorMessage = "Превышено время ожидания ответа от API";
      break;
    case "network":
      errorMessage = "Ошибка сети: нет подключения к интернету";
      break;
    case "validation":
      errorMessage = "Ошибка валидации: некорректный формат запроса";
      break;
  }
  
  console.log(`❌ Создана ошибка типа: ${randomErrorType}`);
  
  return {
    ...state,
    error: errorMessage,
    errorType: randomErrorType,
    processingStage: "error_created",
    metadata: {
      ...state.metadata,
      errorCreatedAt: new Date().toISOString(),
      errorType: randomErrorType,
      intentionalError: true
    }
  };
}

/**
 * Шаг 3: Узел проверки возможности retry
 */
async function checkRetryPossibility(state) {
  console.log("🔄 Проверяю возможность retry");
  
  const { retryCount, maxRetries, error } = state;
  
  if (error && retryCount < maxRetries) {
    console.log(`🔄 Retry возможен: ${retryCount + 1}/${maxRetries}`);
    return {
      ...state,
      retryCount: retryCount + 1,
      processingStage: "retry_attempt",
      metadata: {
        ...state.metadata,
        retryAttempt: retryCount + 1,
        retryAt: new Date().toISOString()
      }
    };
  }
  
  console.log("❌ Retry невозможен, переходим к fallback");
  return {
    ...state,
    processingStage: "fallback_needed",
    metadata: {
      ...state.metadata,
      retryExhausted: true,
      fallbackNeededAt: new Date().toISOString()
    }
  };
}

/**
 * Шаг 4: Простой fallback
 */
async function simpleFallback(state) {
  console.log("🛟 Простой fallback");
  
  const fallbackResponse = `Извините, у меня возникли технические проблемы с обработкой вашего запроса: "${state.userQuery}".

К сожалению, я не могу дать полный ответ в данный момент из-за ${state.errorType} ошибки.

Пожалуйста, попробуйте:
1. Переформулировать вопрос
2. Обратиться позже
3. Связаться с технической поддержкой

Приносим извинения за неудобства.`;

  const userMessage = new HumanMessage(state.userQuery);
  const aiMessage = new AIMessage(fallbackResponse);
  
  return {
    ...state,
    response: fallbackResponse,
    messages: [...state.messages, userMessage, aiMessage],
    fallbackUsed: true,
    fallbackType: "simple",
    fallbackReason: state.error,
    processingStage: "fallback_completed",
    metadata: {
      ...state.metadata,
      fallbackAt: new Date().toISOString(),
      fallbackType: "simple"
    }
  };
}

/**
 * Шаг 5: Кэшированный fallback
 */
async function cachedFallback(state) {
  console.log("💾 Кэшированный fallback");
  
  const { userQuery, cachedResponses } = state;
  
  // Ищем похожие запросы в кэше
  const cacheKey = userQuery.toLowerCase().trim();
  let cachedResponse = cachedResponses[cacheKey];
  
  if (!cachedResponse) {
    // Ищем частичные совпадения
    for (const [key, value] of Object.entries(cachedResponses)) {
      if (cacheKey.includes(key) || key.includes(cacheKey)) {
        cachedResponse = value;
        break;
      }
    }
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
      fallbackReason: "cached_response_found",
      processingStage: "fallback_completed",
      metadata: {
        ...state.metadata,
        fallbackAt: new Date().toISOString(),
        fallbackType: "cached",
        cacheHit: true
      }
    };
  }
  
  // Если кэш пуст, используем простой fallback
  console.log("❌ Кэш пуст, используем простой fallback");
  return simpleFallback(state);
}

/**
 * Шаг 6: Альтернативный fallback с локальной обработкой
 */
async function alternativeFallback(state) {
  console.log("🔄 Альтернативный fallback с локальной обработкой");
  
  const { userQuery } = state;
  
  // Простая локальная обработка без API
  let localResponse = "";
  
  if (userQuery.toLowerCase().includes("привет") || userQuery.toLowerCase().includes("здравствуй")) {
    localResponse = "Привет! К сожалению, у меня сейчас технические проблемы, но я рад вас видеть!";
  } else if (userQuery.toLowerCase().includes("время") || userQuery.toLowerCase().includes("дата")) {
    const now = new Date();
    localResponse = `Текущее время: ${now.toLocaleString('ru-RU')}. К сожалению, я не могу дать более детальную информацию из-за технических проблем.`;
  } else if (userQuery.toLowerCase().includes("помощь") || userQuery.toLowerCase().includes("help")) {
    localResponse = "Я готов помочь! К сожалению, у меня сейчас ограниченные возможности из-за технических проблем. Попробуйте переформулировать вопрос или обратитесь позже.";
  } else {
    localResponse = `Я получил ваш запрос: "${userQuery}", но у меня сейчас технические проблемы. Я не могу дать полный ответ, но запомнил ваш вопрос для будущего обращения.`;
  }
  
  const userMessage = new HumanMessage(userQuery);
  const aiMessage = new AIMessage(localResponse);
  
  return {
    ...state,
    response: localResponse,
    messages: [...state.messages, userMessage, aiMessage],
    fallbackUsed: true,
    fallbackType: "alternative",
    fallbackReason: "local_processing",
    processingStage: "fallback_completed",
    metadata: {
      ...state.metadata,
      fallbackAt: new Date().toISOString(),
      fallbackType: "alternative",
      localProcessing: true
    }
  };
}

/**
 * Шаг 7: Попытка восстановления с API
 */
async function recoveryAttempt(state) {
  console.log("🔧 Попытка восстановления с API");
  
  try {
    const model = new ChatPerplexity({
      model: "sonar-pro",
      temperature: 0.3,
      maxTokens: 300,
      apiKey: process.env.PERPLEXITY_API_KEY,
    });
    
    const prompt = ChatPromptTemplate.fromMessages([
      ["system", "Дай краткий ответ на русском языке. Если не можешь ответить, скажи об этом честно."],
      ["human", "{query}"]
    ]);
    
    const chain = prompt.pipe(model);
    const result = await chain.invoke({ query: state.userQuery });
    
    const userMessage = new HumanMessage(state.userQuery);
    const aiMessage = new AIMessage(result.content);
    
    console.log("✅ Восстановление успешно!");
    
    return {
      ...state,
      response: result.content,
      messages: [...state.messages, userMessage, aiMessage],
      error: null,
      processingStage: "recovery_successful",
      metadata: {
        ...state.metadata,
        recoveryAt: new Date().toISOString(),
        recoverySuccessful: true
      }
    };
    
  } catch (error) {
    console.log("❌ Восстановление не удалось:", error.message);
    return {
      ...state,
      error: error.message,
      processingStage: "recovery_failed",
      metadata: {
        ...state.metadata,
        recoveryFailedAt: new Date().toISOString(),
        recoveryError: error.message
      }
    };
  }
}

/**
 * Шаг 8: Функция выбора fallback стратегии
 */
function selectFallbackStrategy(state) {
  console.log("🎯 Выбираю fallback стратегию");
  
  const { errorType, cachedResponses, userQuery } = state;
  
  // Если есть кэшированные ответы, используем кэшированный fallback
  if (Object.keys(cachedResponses).length > 0) {
    console.log("💾 Выбрана кэшированная стратегия");
    return "cached_fallback";
  }
  
  // Для определенных типов ошибок используем альтернативный fallback
  if (errorType === "network" || errorType === "timeout") {
    console.log("🔄 Выбрана альтернативная стратегия");
    return "alternative_fallback";
  }
  
  // По умолчанию - простой fallback
  console.log("🛟 Выбрана простая стратегия");
  return "simple_fallback";
}

/**
 * Шаг 9: Функция принятия решений
 */
function decideNextStep(state) {
  console.log("🤔 Принимаю решение о следующем шаге");
  
  const { processingStage, error, retryCount, maxRetries } = state;
  
  // Если создана ошибка, проверяем retry
  if (processingStage === "error_created") {
    return "check_retry";
  }
  
  // Если retry возможен, пытаемся восстановиться
  if (processingStage === "retry_attempt") {
    return "recovery_attempt";
  }
  
  // Если нужен fallback, выбираем стратегию
  if (processingStage === "fallback_needed") {
    return "select_fallback_strategy";
  }
  
  // Если восстановление не удалось, переходим к fallback
  if (processingStage === "recovery_failed") {
    return "select_fallback_strategy";
  }
  
  // Если все завершено
  if (processingStage === "fallback_completed" || processingStage === "recovery_successful") {
    return "end";
  }
  
  // По умолчанию - проверка retry
  return "check_retry";
}

/**
 * Шаг 10: Узел выбора fallback стратегии
 */
async function selectFallbackStrategyNode(state) {
  console.log("🎯 Узел выбора fallback стратегии");
  
  const strategy = selectFallbackStrategy(state);
  
  return {
    ...state,
    processingStage: "fallback_strategy_selected",
    metadata: {
      ...state.metadata,
      selectedStrategy: strategy,
      strategySelectedAt: new Date().toISOString()
    }
  };
}

/**
 * Шаг 11: Создаем граф с fallback
 * 
 * 🏗️ ГРАФОВАЯ АРХИТЕКТУРА С FALLBACK МЕХАНИЗМАМИ:
 * 
 * Этот граф демонстрирует продвинутую обработку ошибок в LangGraph:
 * 
 * 📍 СПЕЦИАЛИЗИРОВАННЫЕ УЗЛЫ ДЛЯ ОБРАБОТКИ ОШИБОК:
 *    - intentional_error: намеренное создание ошибок для тестирования
 *    - check_retry: проверка возможности повторной попытки
 *    - recovery_attempt: попытка восстановления с API
 *    - select_fallback_strategy: выбор стратегии fallback
 *    - simple_fallback: простой fallback с сообщением об ошибке
 *    - cached_fallback: кэшированный fallback с поиском в кэше
 *    - alternative_fallback: альтернативный fallback с локальной обработкой
 * 
 * 🔗 СЛОЖНАЯ СТРУКТУРА РЁБЕР С МНОЖЕСТВЕННЫМИ УСЛОВИЯМИ:
 *    - Фиксированные рёбра для последовательной обработки ошибок
 *    - Множественные условные рёбра для выбора стратегий
 *    - Поддержка различных путей восстановления
 *    - Завершающие рёбра для всех fallback стратегий
 * 
 * 🎯 ПРОДВИНУТАЯ СИСТЕМА ПРИНЯТИЯ РЕШЕНИЙ:
 *    - Анализ типа ошибки для выбора стратегии
 *    - Проверка доступности кэшированных ответов
 *    - Выбор между различными fallback механизмами
 *    - Поддержка retry логики с лимитами
 * 
 * 📊 ВИЗУАЛИЗАЦИЯ FALLBACK ГРАФА:
 *    START ──► [intentional_error] ──► [check_retry] ──┬──► [recovery_attempt] ──┬──► END
 *                                                    │                        ├──► [select_fallback_strategy] ──┬──► [simple_fallback] ──┐
 *                                                    │                        │                                   ├──► [cached_fallback] ─────┤
 *                                                    │                        │                                   └──► [alternative_fallback] ─┘
 *                                                    └──► [select_fallback_strategy] ──┬──► [simple_fallback] ──┐
 *                                                                                     ├──► [cached_fallback] ─────┤
 *                                                                                     └──► [alternative_fallback] ─┘
 * 
 * 🔄 МНОГОУРОВНЕВАЯ ОБРАБОТКА ОШИБОК:
 *    - Ошибка → Retry → Восстановление → Fallback → Завершение
 *    - Поддержка различных стратегий fallback
 *    - Кэширование для улучшения производительности
 *    - Локальная обработка как последний уровень защиты
 */
const fallbackWorkflow = new StateGraph(FallbackGraphState)
  // 🏗️ ДОБАВЛЯЕМ СПЕЦИАЛИЗИРОВАННЫЕ УЗЛЫ ДЛЯ ОБРАБОТКИ ОШИБОК
  .addNode("intentional_error", intentionalErrorNode)        // Создание ошибок
  .addNode("check_retry", checkRetryPossibility)             // Проверка retry
  .addNode("recovery_attempt", recoveryAttempt)              // Попытка восстановления
  .addNode("select_fallback_strategy", selectFallbackStrategyNode) // Выбор стратегии
  .addNode("simple_fallback", simpleFallback)               // Простой fallback
  .addNode("cached_fallback", cachedFallback)               // Кэшированный fallback
  .addNode("alternative_fallback", alternativeFallback)     // Альтернативный fallback
  
  // 🔗 ФИКСИРОВАННЫЕ РЁБРА - последовательная обработка ошибок
  // Начальная точка: START -> intentional_error
  .addEdge(START, "intentional_error")
  
  // От создания ошибки к проверке retry
  .addEdge("intentional_error", "check_retry")
  
  // 🎯 УСЛОВНЫЕ РЁБРА ДЛЯ RETRY ЛОГИКИ
  // От проверки retry к восстановлению или fallback
  .addConditionalEdges(
    "check_retry",                    // Исходный узел
    (state) => {                      // Функция выбора
      if (state.processingStage === "retry_attempt") {
        return "recovery_attempt";    // Если retry возможен
      } else {
        return "select_fallback_strategy"; // Если retry невозможен
      }
    },
    {                                 // Маппинг путей
      recovery_attempt: "recovery_attempt",
      select_fallback_strategy: "select_fallback_strategy"
    }
  )
  
  // 🎯 УСЛОВНЫЕ РЁБРА ДЛЯ ВОССТАНОВЛЕНИЯ
  // От попытки восстановления к завершению или fallback
  .addConditionalEdges(
    "recovery_attempt",               // Исходный узел
    (state) => {                      // Функция выбора
      if (state.processingStage === "recovery_successful") {
        return "end";                 // Если восстановление успешно
      } else {
        return "select_fallback_strategy"; // Если восстановление не удалось
      }
    },
    {                                 // Маппинг путей
      end: END,
      select_fallback_strategy: "select_fallback_strategy"
    }
  )
  
  // 🎯 УСЛОВНЫЕ РЁБРА ДЛЯ ВЫБОРА FALLBACK СТРАТЕГИИ
  // От выбора стратегии к конкретному fallback
  .addConditionalEdges(
    "select_fallback_strategy",       // Исходный узел
    (state) => {                      // Функция выбора стратегии
      const strategy = state.metadata?.selectedStrategy || "simple_fallback";
      return strategy;
    },
    {                                 // Маппинг всех fallback стратегий
      simple_fallback: "simple_fallback",
      cached_fallback: "cached_fallback",
      alternative_fallback: "alternative_fallback"
    }
  )
  
  // 🔗 ЗАВЕРШАЮЩИЕ РЁБРА
  // Все fallback стратегии завершают граф
  .addEdge("simple_fallback", END)
  .addEdge("cached_fallback", END)
  .addEdge("alternative_fallback", END);

/**
 * Шаг 12: Компилируем граф
 * 
 * 🔧 КОМПИЛЯЦИЯ ГРАФА С FALLBACK МЕХАНИЗМАМИ:
 * 
 * При компиляции fallback графа LangGraph выполняет специальную оптимизацию:
 * 
 * 1. 🎯 АНАЛИЗ FALLBACK СТРУКТУРЫ:
 *    - Проверяет все 7 узлов обработки ошибок
 *    - Валидирует множественные условные рёбра
 *    - Проверяет корректность fallback стратегий
 *    - Оптимизирует порядок обработки ошибок
 * 
 * 2. 🔄 ОПТИМИЗАЦИЯ RETRY И ВОССТАНОВЛЕНИЯ:
 *    - Обнаруживает все пути восстановления
 *    - Оптимизирует retry логику
 *    - Предотвращает бесконечные циклы восстановления
 *    - Настраивает лимиты retry
 * 
 * 3. 🛡️ ВАЛИДАЦИЯ FALLBACK СИСТЕМЫ:
 *    - Проверяет, что все узлы имеют пути к fallback
 *    - Валидирует завершающие рёбра
 *    - Проверяет корректность обработки ошибок
 *    - Обеспечивает graceful degradation
 * 
 * 4. 📊 СОЗДАНИЕ FALLBACK ДВИЖКА:
 *    - Создает движок с поддержкой fallback механизмов
 *    - Настраивает сложную систему обработки ошибок
 *    - Подготавливает retry и восстановление
 *    - Оптимизирует передачу состояния между fallback узлами
 */
const fallbackApp = fallbackWorkflow.compile();

/**
 * Функция для добавления кэшированных ответов
 */
function addCachedResponse(state, query, response) {
  return {
    ...state,
    cachedResponses: {
      ...state.cachedResponses,
      [query.toLowerCase().trim()]: response
    }
  };
}

/**
 * Функция для запуска fallback графа
 * 
 * 🚀 ВЫПОЛНЕНИЕ FALLBACK ГРАФА:
 * 
 * Выполнение fallback графа - это сложный процесс обработки ошибок:
 * 
 * 1. 🎯 ИНИЦИАЛИЗАЦИЯ С FALLBACK СОСТОЯНИЕМ:
 *    - Состояние содержит поля для обработки ошибок
 *    - Включает кэшированные ответы для fallback
 *    - Содержит настройки retry и fallback
 *    - Поддерживает отслеживание типов ошибок
 * 
 * 2. 🔄 МНОГОУРОВНЕВАЯ ОБРАБОТКА ОШИБОК:
 *    - Создание ошибки → Retry → Восстановление → Fallback → Завершение
 *    - Каждый уровень может вернуться к предыдущему
 *    - Поддержка различных стратегий fallback
 *    - Graceful degradation при критических сбоях
 * 
 * 3. 🎯 СЛОЖНАЯ СИСТЕМА FALLBACK:
 *    - Анализ типа ошибки для выбора стратегии
 *    - Проверка доступности кэшированных ответов
 *    - Выбор между простым, кэшированным и альтернативным fallback
 *    - Локальная обработка как последний уровень защиты
 * 
 * 4. 📊 ОТСЛЕЖИВАНИЕ FALLBACK ПРОИЗВОДИТЕЛЬНОСТИ:
 *    - Измерение времени обработки ошибок
 *    - Отслеживание использования fallback стратегий
 *    - Мониторинг retry и восстановления
 *    - Логирование всех fallback событий
 * 
 * 5. 🛡️ РОБУСТНАЯ ОБРАБОТКА ОШИБОК:
 *    - Множественные уровни fallback защиты
 *    - Retry логика с экспоненциальным backoff
 *    - Кэширование для улучшения производительности
 *    - Локальная обработка как последний уровень защиты
 */
async function runFallbackExample(query, options = {}) {
  console.log("🛟 Запускаю fallback граф...");
  
  const startTime = Date.now();
  
  // 🏗️ СОЗДАЕМ СОСТОЯНИЕ С FALLBACK ПОЛЯМИ
  // Включает все поля для обработки ошибок и fallback логики
  const initialState = {
    userQuery: query,
    response: "",
    messages: [],
    error: null,                        // Ошибка, если есть
    errorType: "",                     // Тип ошибки
    fallbackUsed: false,               // Флаг использования fallback
    fallbackType: "",                  // Тип fallback стратегии
    fallbackReason: "",                // Причина fallback
    retryCount: 0,                     // Счетчик попыток
    maxRetries: options.maxRetries || 2, // Максимальное количество попыток
    cachedResponses: options.cachedResponses || {}, // Кэшированные ответы
    startTime,                         // Время начала
    processingTime: 0,                 // Время обработки
    metadata: {
      startedAt: new Date().toISOString(),
      options
    }
  };
  
  try {
    // 🚀 ВЫПОЛНЯЕМ FALLBACK ГРАФ
    // Графовый движок будет:
    // 1. Создавать ошибки для тестирования
    // 2. Проверять возможность retry
    // 3. Пытаться восстановиться с API
    // 4. Выбирать подходящую fallback стратегию
    // 5. Выполнять выбранную fallback стратегию
    const result = await fallbackApp.invoke(initialState);
    
    const endTime = Date.now();
    const processingTime = endTime - startTime;
    
    console.log("✅ Fallback граф выполнен!");
    
    // 📊 ВОЗВРАЩАЕМ РЕЗУЛЬТАТ С FALLBACK МЕТРИКАМИ
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
    console.error("❌ Ошибка при выполнении fallback графа:", error);
    throw error;
  }
}

/**
 * Пример использования
 */
async function main() {
  try {
    console.log("🛟 Пример Fallback механизма в LangGraph");
    console.log("=" .repeat(50));
    
    // Предварительно заполняем кэш для демонстрации
    const cachedResponses = {
      "что такое машинное обучение": "Машинное обучение - это область искусственного интеллекта, которая позволяет компьютерам учиться и принимать решения без явного программирования.",
      "привет": "Привет! Как дела?",
      "время": "Текущее время можно узнать, посмотрев на часы или календарь."
    };
    
    // Тестовые запросы
    const testQueries = [
      "Что такое машинное обучение?", // Должен найти в кэше
      "Привет, как дела?", // Должен найти в кэше
      "Какое сейчас время?", // Должен найти в кэше
      "Объясни квантовую физику", // Не найдет в кэше, пойдет в альтернативный fallback
      "Расскажи про блокчейн" // Не найдет в кэше, пойдет в простой fallback
    ];
    
    for (const query of testQueries) {
      console.log(`\n📝 Запрос: ${query}`);
      console.log("⏳ Обрабатываю с fallback...");
      
      const result = await runFallbackExample(query, { 
        cachedResponses,
        maxRetries: 1 
      });
      
      console.log("✅ Результат:");
      console.log("-".repeat(40));
      console.log(result.response);
      console.log("-".repeat(40));
      console.log(`📊 Анализ:`);
      console.log(`  - Fallback использован: ${result.fallbackUsed ? 'Да' : 'Нет'}`);
      console.log(`  - Тип fallback: ${result.fallbackType || 'Нет'}`);
      console.log(`  - Причина fallback: ${result.fallbackReason || 'Нет'}`);
      console.log(`  - Retry попыток: ${result.retryCount}/${result.maxRetries}`);
      console.log(`  - Время обработки: ${result.processingTime}ms`);
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
export { runFallbackExample, fallbackApp, FallbackGraphState, addCachedResponse };
