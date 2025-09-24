/**
 * 🎓 Уровень 2: Анализ Pull Request из GitHub с помощью LangGraph + LLM
 *
 * Этот пример показывает, как по аналогии с базовым графом подключить ту же LLM
 * (ChatPerplexity) и организовать workflow для:
 * - Получения данных о Pull Request из GitHub API
 * - Краткого анализа изменений с помощью LLM
 * - Вывода отчёта в консоль
 *
 * Время изучения: 25-35 минут
 * Сложность: 🟡 Базовый/Средний
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
 * Шаг 1: Определяем состояние графа
 *
 * Здесь мы описываем входные параметры (репозиторий и номер PR),
 * данные, которые получим от GitHub (prData, filesChanged),
 * и результат анализа (analysisReport), а также служебные поля.
 */
const GithubPrState = z.object({
  // Владелец репозитория (организация или пользователь)
  repoOwner: z.string().min(1, "repoOwner обязателен"),

  // Имя репозитория
  repoName: z.string().min(1, "repoName обязателен"),

  // Номер Pull Request
  pullNumber: z.number().int().nonnegative(),

  // Данные о PR (как вернёт GitHub API)
  prData: z.record(z.any()).nullable().default(null),

  // Список изменённых файлов в PR
  filesChanged: z.array(z.record(z.any())).default([]),

  // Отчёт от LLM
  analysisReport: z.string().default(""),

  // История сообщений LLM для контекста
  messages: z.array(z.any()).default([]),

  // Произвольные метаданные
  metadata: z.record(z.any()).default({})
});

/**
 * Вспомогательная функция: безопасный запрос к GitHub API с базовой обработкой ошибок
 */
async function githubApiRequest(url, token) {
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "langgraph-pr-analysis"
  };

  const response = await fetch(url, { headers });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API error ${response.status}: ${text}`);
  }
  return response.json();
}

/**
 * Шаг 2: Узел получения данных о PR и списке файлов
 *
 * Узел обращается к GitHub API:
 * - /pulls/{number}
 * - /pulls/{number}/files (c пагинацией)
 */
async function fetchPullRequest(state) {
  console.log("🔎 Получаю данные PR из GitHub...");

  const { repoOwner, repoName, pullNumber } = state;
  const token = process.env.GITHUB_TOKEN;

  if (!token) {
    throw new Error("❌ GITHUB_TOKEN не найден в переменных окружения");
  }

  const base = `https://api.github.com/repos/${repoOwner}/${repoName}`;

  try {
    // Получаем сам PRc
    const prUrl = `${base}/pulls/${pullNumber}`;
    const prData = await githubApiRequest(prUrl, token);

    // Получаем файлы с учётом пагинации
    let page = 1;
    const perPage = 100;
    const filesChanged = [];
    while (true) {
      const filesUrl = `${base}/pulls/${pullNumber}/files?per_page=${perPage}&page=${page}`;
      const batch = await githubApiRequest(filesUrl, token);
      if (!Array.isArray(batch) || batch.length === 0) {
        break;
      }
      filesChanged.push(
        ...batch.map((f) => ({
          filename: f.filename,
          status: f.status,
          additions: f.additions,
          deletions: f.deletions,
          changes: f.changes,
          // Патчи могут быть длинными; при необходимости можно обрезать
          patch: typeof f.patch === "string" ? f.patch.slice(0, 2000) : undefined
        }))
      );
      if (batch.length < perPage) {
        break;
      }
      page += 1;
    }

    console.log(`✅ PR и файлы получены (изменено файлов: ${filesChanged.length})`);

    return {
      ...state,
      prData,
      filesChanged,
      metadata: {
        ...state.metadata,
        fetchedAt: new Date().toISOString(),
        repository: `${repoOwner}/${repoName}`,
        pullNumber
      }
    };
  } catch (error) {
    console.error("❌ Ошибка получения PR:", error.message);
    return {
      ...state,
      prData: state.prData,
      filesChanged: state.filesChanged,
      metadata: {
        ...state.metadata,
        error: error.message,
        errorAt: new Date().toISOString()
      }
    };
  }
}

/**
 * Шаг 3: Узел анализа PR с помощью LLM
 *
 * Формируем компактный контекст из заголовка, описания и списка файлов,
 * просим LLM дать краткий отчёт для консоли.
 */
async function analyzePullRequest(state) {
  console.log("🧠 Анализирую PR с помощью LLM...");

  const model = new ChatPerplexity({
    model: "sonar-pro",
    temperature: 0.3,
    maxTokens: 500,
    apiKey: process.env.PERPLEXITY_API_KEY
  });

  const prompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      "Ты опытный ревьюер кода. Отвечай кратко, структурированно и по-русски. " +
        "Дай понятный отчёт для консоли: краткое резюме, риски/регрессии, безопасность, тесты, рекомендации."
    ],
    [
      "human",
      `Вот Pull Request:\n\n` +
        `Заголовок: {title}\nАвтор: {author}\nНомер: #{number}\nСсылка: {url}\n\n` +
        `Описание (markdown, может быть сокращено):\n{body}\n\n` +
        `Список изменённых файлов (имя, статус, +/-, всего изменений):\n{filesSummary}\n\n` +
        `Сформируй отчёт: \n` +
        `1) Краткое резюме (1-3 предложения)\n` +
        `2) Потенциальные риски и точки регрессии\n` +
        `3) Вопросы по безопасности и приватности\n` +
        `4) Идеи для тестов (юнит/интеграционные)\n` +
        `5) Конкретные рекомендации по улучшению\n` +
        `6) Чек-лист ревью (буллеты)`
    ]
  ]);

  const pr = state.prData || {};
  const files = Array.isArray(state.filesChanged) ? state.filesChanged : [];

  const filesSummary = files
    .slice(0, 50) // ограничиваем размер контекста
    .map((f) => `- ${f.filename} [${f.status}] +${f.additions}/-${f.deletions} (~${f.changes})`)
    .join("\n");

  try {
    const chain = prompt.pipe(model);
    const result = await chain.invoke({
      title: pr.title || "",
      author: pr.user?.login || "",
      number: pr.number || state.pullNumber,
      url: pr.html_url || "",
      body: (pr.body || "").slice(0, 2000),
      filesSummary: filesSummary || "(нет данных о файлах)"
    });

    const userMessage = new HumanMessage("Analyze PR");
    const aiMessage = new AIMessage(result.content);

    console.log("✅ Анализ завершён");

    return {
      ...state,
      analysisReport: typeof result.content === "string" ? result.content : String(result.content),
      messages: [...state.messages, userMessage, aiMessage],
      metadata: {
        ...state.metadata,
        analyzedAt: new Date().toISOString(),
        model: "sonar-pro"
      }
    };
  } catch (error) {
    console.error("❌ Ошибка анализа PR:", error.message);
    return {
      ...state,
      analysisReport: "Извините, произошла ошибка при анализе PR.",
      metadata: {
        ...state.metadata,
        error: error.message,
        errorAt: new Date().toISOString()
      }
    };
  }
}

/**
 * Шаг 4: Создаём граф и настраиваем рёбра
 *
 * START -> fetch_pull_request -> analyze_pr -> END
 */
const prWorkflow = new StateGraph(GithubPrState)
  .addNode("fetch_pull_request", fetchPullRequest)
  .addNode("analyze_pr", analyzePullRequest)
  .addEdge(START, "fetch_pull_request")
  .addEdge("fetch_pull_request", "analyze_pr")
  .addEdge("analyze_pr", END);

/**
 * Шаг 5: Компилируем граф
 */
const prApp = prWorkflow.compile();

/**
 * Функция для запуска анализа PR
 */
async function runGithubPrAnalysis({ owner, repo, pullNumber }) {
  console.log("🚀 Запускаю анализ GitHub PR...");

  const initialState = {
    repoOwner: owner,
    repoName: repo,
    pullNumber,
    prData: null,
    filesChanged: [],
    analysisReport: "",
    messages: [],
    metadata: {
      startedAt: new Date().toISOString()
    }
  };

  const result = await prApp.invoke(initialState);

  // Выводим отчёт в консоль, как просили
  console.log("\n===== 🧾 Отчёт по PR =====");
  console.log(result.analysisReport);
  console.log("==========================\n");

  return result;
}

/**
 * Пример использования
 */
async function main() {
  try {
    // Проверяем наличие ключей и токенов
    if (!process.env.PERPLEXITY_API_KEY) {
      throw new Error("❌ PERPLEXITY_API_KEY не найден в переменных окружения");
    }
    if (!process.env.GITHUB_TOKEN) {
      throw new Error("❌ GITHUB_TOKEN не найден в переменных окружения");
    }

    console.log("🧪 Пример анализа GitHub PR");
    console.log("=".repeat(50));

    // Параметры можно передать через аргументы CLI: owner repo number
    const [, , ownerArg, repoArg, numberArg] = process.argv;
    const owner = ownerArg || process.env.GITHUB_REPO_OWNER || "octocat";
    const repo = repoArg || process.env.GITHUB_REPO_NAME || "Hello-World";
    const pullNumber = Number(numberArg || process.env.GITHUB_PR_NUMBER || 1);

    if (!owner || !repo || Number.isNaN(pullNumber)) {
      throw new Error("❌ Укажите owner repo number или задайте переменные окружения");
    }

    const result = await runGithubPrAnalysis({ owner, repo, pullNumber });

    console.log("📊 Метаданные:", result.metadata);
    console.log(`💬 Сообщений: ${result.messages.length}`);
  } catch (error) {
    console.error("❌ Критическая ошибка:", error.message);
    console.log("\n💡 Проверьте:");
    console.log("1. Создан ли .env с PERPLEXITY_API_KEY и GITHUB_TOKEN");
    console.log("2. Корректность токенов и прав доступа GitHub");
    console.log("3. Подключение к интернету");
    console.log("4. Аргументы запуска: node 02-github-pr-analysis.js <owner> <repo> <prNumber>");
  }
}

// Запускаем пример, если файл выполняется напрямую
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

// Экспортируем для использования в других модулях
export { runGithubPrAnalysis, prApp as app, GithubPrState };
