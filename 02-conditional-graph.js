/**
 * 🎓 Уровень 2: Граф с условной логикой и fallback
 * 
 * Этот пример демонстрирует:
 * - Условные переходы между узлами
 * - Обработку ошибок и fallback механизмы
 * - Валидацию входных данных
 * - Различные типы узлов
 * 
 * Время изучения: 25-30 минут
 * Сложность: 🟡 Промежуточный
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
 * Шаг 1: Расширенное состояние с дополнительными полями
 */
const ConditionalGraphState = z.object({
  userQuery: z.string().default(""),
  response: z.string().default(""),
  messages: z.array(z.any()).default([]),
  
  // Новые поля для условной логики
  queryType: z.string().default(""), // Тип запроса (simple, complex, error)
  confidence: z.number().default(0), // Уверенность в ответе (0-1)
  error: z.string().nullable().default(null), // Ошибка, если есть
  retryCount: z.number().default(0), // Количество попыток
  fallbackUsed: z.boolean().default(false), // Использовался ли fallback
  nextStep: z.string().default(""), // Следующий шаг для условных переходов
  
  metadata: z.record(z.any()).default({})
});

/**
 * Шаг 2: Узел валидации запроса
 * 
 * Этот узел проверяет входные данные и определяет тип запроса
 */
async function validateQuery(state) {
  console.log("🔍 Валидирую запрос:", state.userQuery);
  
  const query = state.userQuery.toLowerCase();
  
  // Простые запросы (короткие, общие вопросы)
  if (query.length < 50 && (
    query.includes("что такое") || 
    query.includes("кто такой") || 
    query.includes("как называется")
  )) {
    console.log("✅ Простой запрос");
    return {
      ...state,
      queryType: "simple",
      confidence: 0.9
    };
  }
  
  // Сложные запросы (длинные, требующие анализа)
  if (query.length > 100 || (
    query.includes("анализ") || 
    query.includes("сравни") || 
    query.includes("объясни подробно")
  )) {
    console.log("🔍 Сложный запрос");
    return {
      ...state,
      queryType: "complex",
      confidence: 0.7
    };
  }
  
  // Запросы с ошибками или проблемами
  if (query.includes("ошибка") || query.includes("проблема") || query.includes("не работает")) {
    console.log("⚠️ Запрос с проблемой");
    return {
      ...state,
      queryType: "error",
      confidence: 0.5
    };
  }
  
  // По умолчанию - обычный запрос
  console.log("📝 Обычный запрос");
  return {
    ...state,
    queryType: "normal",
    confidence: 0.8
  };
}

/**
 * Шаг 3: Узел обработки простых запросов
 */
async function processSimpleQuery(state) {
  console.log("⚡ Обрабатываю простой запрос");
  
  const model = new ChatPerplexity({
    model: "sonar-pro",
    temperature: 0.3, // Низкая температура для точности
    maxTokens: 300,
    apiKey: process.env.PERPLEXITY_API_KEY,
  });
  
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", "Дай краткий и точный ответ на русском языке. Максимум 2-3 предложения."],
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
      metadata: {
        ...state.metadata,
        processedAt: new Date().toISOString(),
        node: "simple_processor"
      }
    };
    
  } catch (error) {
    console.error("❌ Ошибка в простом процессоре:", error.message);
    return {
      ...state,
      error: error.message,
      confidence: 0.1
    };
  }
}

/**
 * Шаг 4: Узел обработки сложных запросов
 */
async function processComplexQuery(state) {
  console.log("🧠 Обрабатываю сложный запрос");
  
  const model = new ChatPerplexity({
    model: "sonar-pro", // Используем Sonar Pro
    temperature: 0.7,
    maxTokens: 800,
    apiKey: process.env.PERPLEXITY_API_KEY,
  });
  
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", "Проведи детальный анализ и дай развернутый ответ на русском языке. Используй актуальную информацию."],
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
      metadata: {
        ...state.metadata,
        processedAt: new Date().toISOString(),
        node: "complex_processor"
      }
    };
    
  } catch (error) {
    console.error("❌ Ошибка в сложном процессоре:", error.message);
    return {
      ...state,
      error: error.message,
      confidence: 0.2
    };
  }
}

/**
 * Шаг 5: Fallback узел для обработки ошибок
 */
async function fallbackProcessor(state) {
  console.log("🛟 Использую fallback обработку");
  
  // Простой fallback без API вызовов
  const fallbackResponse = `Извините, у меня возникли проблемы с обработкой вашего запроса: "${state.userQuery}". 
  
Попробуйте переформулировать вопрос или обратитесь к технической поддержке.`;

  const userMessage = new HumanMessage(state.userQuery);
  const aiMessage = new AIMessage(fallbackResponse);
  
  return {
    ...state,
    response: fallbackResponse,
    messages: [...state.messages, userMessage, aiMessage],
    fallbackUsed: true,
    confidence: 0.3,
    metadata: {
      ...state.metadata,
      processedAt: new Date().toISOString(),
      node: "fallback_processor",
      fallbackReason: state.error || "unknown"
    }
  };
}

/**
 * Шаг 6: Узел принятия решений
 * 
 * Этот узел решает, какой путь выбрать дальше
 */
function decideNextStep(state) {
  console.log("🤔 Принимаю решение о следующем шаге");
  
  // Если есть ошибка, используем fallback
  if (state.error) {
    console.log("⚠️ Обнаружена ошибка, переходим к fallback");
    return {
      ...state,
      nextStep: "fallback"
    };
  }
  
  // Если запрос уже обработан, завершаем
  if (state.response && state.response.length > 10) {
    console.log("✅ Запрос обработан, завершаем");
    return {
      ...state,
      nextStep: "end"
    };
  }
  
  // Если это простой запрос, обрабатываем как простой
  if (state.queryType === "simple") {
    console.log("⚡ Переходим к простой обработке");
    return {
      ...state,
      nextStep: "simple"
    };
  }
  
  // Если это сложный запрос, обрабатываем как сложный
  if (state.queryType === "complex") {
    console.log("🧠 Переходим к сложной обработке");
    return {
      ...state,
      nextStep: "complex"
    };
  }
  
  // По умолчанию - простая обработка
  console.log("📝 Переходим к обычной обработке");
  return {
    ...state,
    nextStep: "simple"
  };
}

/**
 * Шаг 7: Создаем граф с условной логикой
 * 
 * 🏗️ СЛОЖНАЯ ГРАФОВАЯ АРХИТЕКТУРА С УСЛОВНЫМИ ПЕРЕХОДАМИ:
 * 
 * Этот граф демонстрирует продвинутые возможности LangGraph:
 * 
 * 📍 МНОЖЕСТВЕННЫЕ УЗЛЫ:
 *    - validate: анализ и валидация входных данных
 *    - process_simple: обработка простых запросов
 *    - process_complex: обработка сложных запросов
 *    - fallback: обработка ошибок и fallback логика
 *    - decide: узел принятия решений
 * 
 * 🔗 ФИКСИРОВАННЫЕ РЁБРА:
 *    - START -> validate: всегда начинаем с валидации
 *    - validate -> decide: всегда переходим к принятию решения
 *    - process_simple -> decide: возвращаемся к решению
 *    - process_complex -> decide: возвращаемся к решению
 *    - fallback -> END: fallback завершает граф
 * 
 * 🎯 УСЛОВНЫЕ РЁБРА (Conditional Edges):
 *    - decide -> (различные узлы в зависимости от состояния)
 *    - Позволяют создавать ветвления в графе
 *    - Решение принимается на основе состояния
 *    - Поддерживают сложную логику маршрутизации
 * 
 * 📊 ВИЗУАЛИЗАЦИЯ ГРАФА:
 *    START ──► [validate] ──► [decide] ──┬──► [process_simple] ──┐
 *                                        ├──► [process_complex] ─┤
 *                                        ├──► [fallback] ───────┘
 *                                        └──► END
 * 
 * 🔄 ЦИКЛИЧЕСКАЯ СТРУКТУРА:
 *    - process_simple и process_complex возвращаются к decide
 *    - Это позволяет реализовать retry логику
 *    - Поддерживает итеративную обработку
 */
const workflow = new StateGraph(ConditionalGraphState)
  // 🏗️ ДОБАВЛЯЕМ ВСЕ УЗЛЫ В ГРАФ
  // Каждый узел - это функция, которая обрабатывает состояние
  .addNode("validate", validateQuery)           // Узел валидации
  .addNode("process_simple", processSimpleQuery) // Узел простой обработки
  .addNode("process_complex", processComplexQuery) // Узел сложной обработки
  .addNode("fallback", fallbackProcessor)       // Узел fallback
  .addNode("decide", decideNextStep)            // Узел принятия решений
  
  // 🔗 ФИКСИРОВАННЫЕ РЁБРА - всегда выполняются
  // Начальная точка: START -> validate
  .addEdge(START, "validate")
  
  // От валидации к принятию решения
  .addEdge("validate", "decide")
  
  // 🎯 УСЛОВНЫЕ РЁБРА - зависят от состояния
  // .addConditionalEdges() создает условные переходы
  // Первый параметр: исходный узел ("decide")
  // Второй параметр: функция, которая возвращает имя следующего узла
  // Третий параметр: маппинг значений на имена узлов
  .addConditionalEdges(
    "decide",                    // Исходный узел
    (state) => state.nextStep,   // Функция выбора следующего узла
    {                            // Маппинг значений на узлы
      simple: "process_simple",   // Если nextStep === "simple"
      complex: "process_complex", // Если nextStep === "complex"
      fallback: "fallback",       // Если nextStep === "fallback"
      end: END                    // Если nextStep === "end"
    }
  )
  
  // 🔗 ОБРАТНЫЕ РЁБРА - возвращаемся к решению
  // От процессоров обратно к решению (для retry логики)
  .addEdge("process_simple", "decide")
  .addEdge("process_complex", "decide")
  
  // 🔗 ЗАВЕРШАЮЩИЕ РЁБРА
  // Fallback завершает граф
  .addEdge("fallback", END);

/**
 * Шаг 8: Компилируем граф
 * 
 * 🔧 КОМПИЛЯЦИЯ СЛОЖНОГО ГРАФА С УСЛОВНОЙ ЛОГИКОЙ:
 * 
 * При компиляции условного графа LangGraph выполняет дополнительную работу:
 * 
 * 1. 🎯 АНАЛИЗ УСЛОВНЫХ РЁБЕР:
 *    - Проверяет, что все условные функции корректны
 *    - Валидирует маппинг значений на узлы
 *    - Проверяет, что нет недостижимых узлов
 * 
 * 2. 🔄 ОПТИМИЗАЦИЯ ЦИКЛОВ:
 *    - Обнаруживает циклические структуры
 *    - Оптимизирует retry логику
 *    - Предотвращает бесконечные циклы
 * 
 * 3. 🛡️ ВАЛИДАЦИЯ ГРАФА:
 *    - Проверяет, что все узлы достижимы
 *    - Проверяет, что есть пути к END
 *    - Проверяет корректность условной логики
 * 
 * 4. 📊 СОЗДАНИЕ ГРАФОВОГО ДВИЖКА:
 *    - Создает движок с поддержкой условных переходов
 *    - Настраивает обработку состояний
 *    - Подготавливает систему принятия решений
 */
const app = workflow.compile();

/**
 * Функция для запуска условного графа
 * 
 * 🚀 ВЫПОЛНЕНИЕ УСЛОВНОГО ГРАФА:
 * 
 * Выполнение условного графа отличается от простого графа:
 * 
 * 1. 🎯 ИНИЦИАЛИЗАЦИЯ С РАСШИРЕННЫМ СОСТОЯНИЕМ:
 *    - Состояние содержит больше полей для условной логики
 *    - Включает поля для принятия решений (queryType, confidence)
 *    - Содержит поля для обработки ошибок (error, retryCount)
 * 
 * 2. 🔄 ДИНАМИЧЕСКОЕ ВЫПОЛНЕНИЕ УЗЛОВ:
 *    - Графовый движок выполняет узлы в зависимости от состояния
 *    - Условные рёбра определяют следующий узел во время выполнения
 *    - Поддерживает ветвления и циклы
 * 
 * 3. 🎯 СИСТЕМА ПРИНЯТИЯ РЕШЕНИЙ:
 *    - Узел "decide" анализирует состояние
 *    - Возвращает имя следующего узла в поле nextStep
 *    - Условные рёбра используют это значение для выбора пути
 * 
 * 4. 🔄 RETRY И FALLBACK ЛОГИКА:
 *    - Процессоры возвращаются к узлу "decide"
 *    - Это позволяет реализовать retry логику
 *    - Fallback узел завершает граф при ошибках
 * 
 * 5. 📊 ОТСЛЕЖИВАНИЕ СОСТОЯНИЯ:
 *    - Каждый узел обновляет состояние
 *    - Состояние передается между узлами
 *    - Финальное состояние содержит результат обработки
 */
async function runConditionalGraph(query) {
  console.log("🚀 Запускаю условный граф LangGraph...");
  
  // 🏗️ СОЗДАЕМ РАСШИРЕННОЕ НАЧАЛЬНОЕ СОСТОЯНИЕ
  // Включает все поля, необходимые для условной логики
  const initialState = {
    userQuery: query,
    response: "",
    messages: [],
    queryType: "",           // Тип запроса для условной логики
    confidence: 0,           // Уверенность для принятия решений
    error: null,            // Ошибка, если есть
    retryCount: 0,          // Счетчик попыток
    fallbackUsed: false,    // Флаг использования fallback
    metadata: {
      startedAt: new Date().toISOString()
    }
  };
  
  try {
    // 🚀 ВЫПОЛНЯЕМ УСЛОВНЫЙ ГРАФ
    // Графовый движок будет:
    // 1. Выполнять узлы в порядке, определенном рёбрами
    // 2. Использовать условную логику для выбора путей
    // 3. Поддерживать retry и fallback логику
    const result = await app.invoke(initialState);
    
    console.log("✅ Условный граф выполнен успешно!");
    return result;
    
  } catch (error) {
    console.error("❌ Ошибка при выполнении условного графа:", error);
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
    
    console.log("🎓 Условный граф LangGraph");
    console.log("=" .repeat(50));
    
    // Тестовые запросы разных типов
    const testQueries = [
      "Что такое машинное обучение?", // Простой
      "Проведи детальный анализ влияния искусственного интеллекта на современную экономику и сравни с предыдущими технологическими революциями", // Сложный
      "У меня ошибка в коде, не работает", // Проблемный
      "Расскажи о последних новостях в IT" // Обычный
    ];
    
    for (const query of testQueries) {
      console.log(`\n📝 Запрос: ${query}`);
      console.log("⏳ Обрабатываю...");
      
      const result = await runConditionalGraph(query);
      
      console.log("✅ Результат:");
      console.log("-".repeat(40));
      console.log(result.response);
      console.log("-".repeat(40));
      console.log(`📊 Тип запроса: ${result.queryType}`);
      console.log(`🎯 Уверенность: ${(result.confidence * 100).toFixed(1)}%`);
      console.log(`🛟 Fallback использован: ${result.fallbackUsed ? 'Да' : 'Нет'}`);
      if (result.error) {
        console.log(`❌ Ошибка: ${result.error}`);
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
export { runConditionalGraph, app, ConditionalGraphState };
