/**
 * Raspagem de Processos do Acervo Geral - PJE
 *
 * Este script:
 * 1. Faz login no PJE
 * 2. Obtém todos os processos do acervo geral (todas as páginas)
 * 3. Salva em JSON
 *
 * COMO USAR:
 * 1. Configure as credenciais no arquivo .env (PJE_CPF, PJE_SENHA, PJE_ID_ADVOGADO)
 * 2. Execute: node scripts/pje-trt/trt3/1g/acervo/raspar-acervo-geral.js
 * 3. Veja resultados em: data/pje/processos/acervo-geral.json
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs/promises';
import { validarCredenciais, obterIdAdvogado } from '../common/auth-helpers.js';

puppeteer.use(StealthPlugin());

// Valida credenciais antes de prosseguir (CPF e SENHA são obrigatórios, ID_ADVOGADO é opcional)
validarCredenciais(false);

// Lê credenciais das variáveis de ambiente
const CPF = process.env.PJE_CPF;
const SENHA = process.env.PJE_SENHA;
const ID_ADVOGADO = process.env.PJE_ID_ADVOGADO ? parseInt(process.env.PJE_ID_ADVOGADO, 10) : null;

// URLs configuráveis via environment variables (para multi-tribunal)
const PJE_LOGIN_URL = process.env.PJE_LOGIN_URL || 'https://pje.trt3.jus.br/primeirograu/login.seam';
const PJE_BASE_URL = process.env.PJE_BASE_URL || 'https://pje.trt3.jus.br';
const PJE_API_URL = process.env.PJE_API_URL || 'https://pje.trt3.jus.br/pje-comum-api/api';

const DATA_DIR = 'data/pje/acervo';
const SKIP_FILE_OUTPUT = process.env.PJE_OUTPUT_FILE === '';

// ID do agrupamento Acervo Geral
const ID_ACERVO_GERAL = 1;

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function rasparAcervoGeral() {
  console.error('╔═══════════════════════════════════════════════════════════════════╗');
  console.error('║     RASPAGEM: ACERVO GERAL                                        ║');
  console.error('╚═══════════════════════════════════════════════════════════════════╝\n');

  // Criar diretórios
  await fs.mkdir(DATA_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
  });

  const page = await browser.newPage();

  try {
    // ====================================================================
    // PASSO 1: LOGIN NO PJE
    // ====================================================================

    console.error('🔐 Fazendo login no PJE...\n');

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');

    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      window.chrome = { runtime: {} };
    });

    await page.goto(PJE_LOGIN_URL, { waitUntil: 'networkidle2' });
    await delay(1500);

    // Clica em "Entrar com PDPJ"
    await page.waitForSelector('#btnSsoPdpj', { visible: true });
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
      page.click('#btnSsoPdpj'),
    ]);

    // Preenche credenciais - aguarda até 15s para página SSO carregar
    console.error('⏳ Aguardando página SSO carregar...');
    await page.waitForSelector('#username', { visible: true, timeout: 15000 });
    await page.type('#username', CPF);
    console.error('✅ CPF preenchido');
    await delay(1000);

    await page.waitForSelector('#password', { visible: true, timeout: 10000 });
    await page.type('#password', SENHA);
    console.error('✅ Senha preenchida');
    await delay(1500);

    // Clica em Entrar
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }),
      page.click('#kc-login'),
    ]);

    console.error('✅ Login realizado!\n');
    await delay(5000);

    // ====================================================================
    // PASSO 2: BUSCAR ID DO ADVOGADO (do JWT ou fallback para variável de ambiente)
    // ====================================================================

    const { idAdvogado, advogadoInfo } = await obterIdAdvogado(page, ID_ADVOGADO);

    // ====================================================================
    // PASSO 3: BUSCAR TOTALIZADORES (para confirmar quantidade)
    // ====================================================================

    console.error('📊 Verificando quantidade de processos do acervo geral...\n');

    const totalizadores = await page.evaluate(async (id) => {
      const response = await fetch(`/pje-comum-api/api/paineladvogado/${id}/totalizadores?tipoPainelAdvogado=0`);
      return await response.json();
    }, idAdvogado);

    const totalizadorAcervo = totalizadores.find(t => t.idAgrupamentoProcessoTarefa === ID_ACERVO_GERAL);

    if (totalizadorAcervo) {
      console.error(`📋 Total de processos no acervo geral: ${totalizadorAcervo.quantidadeProcessos}\n`);
    }

    // ====================================================================
    // PASSO 4: RASPAR TODOS OS PROCESSOS DO ACERVO GERAL
    // ====================================================================

    console.error('🔄 Iniciando raspagem de processos do acervo geral...\n');

    const processos = await rasparAgrupamento(page, idAdvogado, ID_ACERVO_GERAL);

    // ====================================================================
    // PASSO 5: SALVAR RESULTADOS
    // ====================================================================

    // Salvar em arquivo (opcional, para backward compatibility)
    if (!SKIP_FILE_OUTPUT) {
      const filename = `${DATA_DIR}/acervo-geral.json`;
      await fs.writeFile(filename, JSON.stringify(processos, null, 2));
      console.error(`📁 Arquivo salvo: ${filename}`);
    }

    console.error('\n' + '='.repeat(70));
    console.error('📊 RELATÓRIO FINAL');
    console.error('='.repeat(70) + '\n');
    console.error(`Data da raspagem: ${new Date().toISOString()}`);
    console.error(`Total de processos raspados: ${processos.length}\n`);

    if (processos.length > 0) {
      console.error('Primeiros 3 processos:');
      processos.slice(0, 3).forEach((p, i) => {
        console.error(`  ${i + 1}. ${p.numeroProcesso} - ${p.nomeParteAutora}`);
      });
      console.error('');
    }

    console.error('='.repeat(70));
    console.error('✅ RASPAGEM CONCLUÍDA!');
    console.error('='.repeat(70) + '\n');

    // Saída JSON para stdout (para integração com sistema de fila)
    const resultado = {
      success: true,
      processosCount: processos.length,
      processos: processos,
      timestamp: new Date().toISOString(),
      // Inclui info do advogado para salvar no banco (se foi descoberto via JWT)
      advogado: advogadoInfo,
    };
    console.log(JSON.stringify(resultado));

  } catch (error) {
    console.error('\n❌ Erro:', error.message);
    console.error(error.stack);

    // Saída JSON de erro para stdout
    const resultadoErro = {
      success: false,
      processosCount: 0,
      processos: [],
      timestamp: new Date().toISOString(),
      error: {
        type: 'script_error',
        category: 'execution',
        message: error.message,
        technicalMessage: error.stack,
        retryable: false,
        timestamp: new Date().toISOString()
      }
    };
    console.log(JSON.stringify(resultadoErro));
    process.exit(1);
  } finally {
    await browser.close();
  }
}

/**
 * Raspa todos os processos de um agrupamento específico
 */
async function rasparAgrupamento(page, idAdvogado, idAgrupamento) {
  const todosProcessos = [];
  let paginaAtual = 1;
  const tamanhoPagina = 100;
  let totalPaginas = null;

  while (true) {
    console.error(`   Página ${paginaAtual}/${totalPaginas || '?'}...`);

    const resultado = await page.evaluate(async (id, agrupamento, pagina, tamanho) => {
      try {
        const url = `/pje-comum-api/api/paineladvogado/${id}/processos?idAgrupamentoProcessoTarefa=${agrupamento}&pagina=${pagina}&tamanhoPagina=${tamanho}`;
        const response = await fetch(url);

        if (!response.ok) {
          return { error: `HTTP ${response.status}` };
        }

        return await response.json();
      } catch (e) {
        return { error: e.message };
      }
    }, idAdvogado, idAgrupamento, paginaAtual, tamanhoPagina);

    if (resultado.error) {
      console.error(`   ❌ Erro na página ${paginaAtual}: ${resultado.error}`);
      break;
    }

    // Primeira página - descobre total de páginas
    if (totalPaginas === null) {
      totalPaginas = resultado.qtdPaginas || 1;
      console.error(`   Total de páginas: ${totalPaginas}`);
      console.error(`   Total de processos: ${resultado.totalRegistros || '?'}\n`);
    }

    // Adiciona processos desta página
    if (resultado.resultado && Array.isArray(resultado.resultado)) {
      todosProcessos.push(...resultado.resultado);
      console.error(`   ✅ ${resultado.resultado.length} processos capturados`);
    }

    // Verifica se chegou na última página
    if (paginaAtual >= totalPaginas) {
      break;
    }

    paginaAtual++;

    // Delay entre requisições para não sobrecarregar o servidor
    await delay(500);
  }

  return todosProcessos;
}

// Executa
rasparAcervoGeral().catch(console.error);
