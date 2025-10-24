/**
 * Raspagem PJE - Pendentes de Manifestação
 * Filtros: Sem Prazo
 *
 * Este script:
 * 1. Faz login no PJE
 * 2. Obtém processos pendentes filtrados por:
 *    - Prazo: Sem prazo (I)
 * 3. Salva em JSON com nomenclatura padronizada
 * 4. Baixa PDFs dos documentos
 *
 * COMO USAR:
 * 1. Atualize CPF e SENHA
 * 2. Execute: node scripts/pje/raspadores/raspar-pendentes-sem-prazo.js
 * 3. Veja resultados em: data/pje/trt3/1g/pendentes/
 *
 * PADRÃO DE NOMENCLATURA:
 * pend-I-{timestamp}.json
 * - pend = Pendentes de Manifestação
 * - I = Sem prazo (Intimação)
 * - timestamp = YYYYMMDD-HHMMSS
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs/promises';
import path from 'path';

puppeteer.use(StealthPlugin());

// ⚠️ ATUALIZE SUAS CREDENCIAIS:
const CPF = '07529294610';
const SENHA = '12345678A@';

const PJE_LOGIN_URL = 'https://pje.trt3.jus.br/primeirograu/login.seam';
const DATA_DIR = 'data/pje/trt3/1g/pendentes';
const PDF_DIR = 'data/pje/trt3/1g/pendentes/pdfs';

// Configurações do raspador
const CONFIG = {
  trt: 'trt3',
  grau: '1g',
  agrupador: 'pend', // Pendentes de Manifestação
  filtros: ['I'],    // I = Sem prazo (Intimação)
  api: {
    tipoPainelAdvogado: 2,
    idPainelAdvogadoEnum: 2,
    ordenacaoCrescente: false,
  },
};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Gera nome do arquivo baseado no padrão
 */
function gerarNomeArquivo() {
  const now = new Date();
  const timestamp = now.toISOString()
    .replace(/[-:]/g, '')
    .replace('T', '-')
    .split('.')[0]; // YYYYMMDD-HHMMSS

  const filtros = CONFIG.filtros.join('-');
  return `${CONFIG.agrupador}-${filtros}-${timestamp}.json`;
}

async function rasparPendentesManifestation() {
  console.log('╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║   RASPAGEM: PENDENTES - SEM PRAZO                                 ║');
  console.log('╚═══════════════════════════════════════════════════════════════════╝\n');

  // Criar diretórios
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(PDF_DIR, { recursive: true });

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

    console.log('🔐 Fazendo login no PJE...\n');

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

    // Preenche credenciais
    await delay(2000);
    await page.waitForSelector('#username', { visible: true });
    await page.type('#username', CPF);
    await delay(1000);

    await page.waitForSelector('#password', { visible: true });
    await page.type('#password', SENHA);
    await delay(1500);

    // Clica em Entrar
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }),
      page.click('#kc-login'),
    ]);

    console.log('✅ Login realizado!\n');
    await delay(5000);

    // ====================================================================
    // PASSO 2: DEFINIR ID DO ADVOGADO
    // ====================================================================

    console.log('👤 Configurando ID do advogado...\n');

    const idAdvogado = 29203;
    console.log(`✅ ID do advogado: ${idAdvogado}\n`);

    // ====================================================================
    // PASSO 3: RASPAR PROCESSOS COM FILTROS
    // ====================================================================

    console.log('📋 Filtros aplicados:');
    console.log(`   - Prazo: Sem prazo (${CONFIG.filtros.join(', ')})\n`);
    console.log('🔄 Iniciando raspagem...\n');

    const processos = await rasparComFiltros(page, idAdvogado);

    // ====================================================================
    // PASSO 4: DELETAR ARQUIVOS ANTIGOS
    // ====================================================================

    console.log('\n🗑️  Limpando arquivos antigos...\n');

    const arquivos = await fs.readdir(DATA_DIR);
    const filtrosStr = CONFIG.filtros.join('-');
    const padrao = new RegExp(`^${CONFIG.agrupador}-${filtrosStr}-`);

    for (const arquivo of arquivos) {
      if (padrao.test(arquivo)) {
        const caminhoCompleto = path.join(DATA_DIR, arquivo);
        await fs.unlink(caminhoCompleto);
        console.log(`   ❌ Deletado: ${arquivo}`);
      }
    }

    // ====================================================================
    // PASSO 4: SALVAR RESULTADOS
    // ====================================================================

    const nomeArquivo = gerarNomeArquivo();
    const caminhoArquivo = path.join(DATA_DIR, nomeArquivo);

    await fs.writeFile(caminhoArquivo, JSON.stringify(processos, null, 2));

    console.log('\n' + '='.repeat(70));
    console.log('📊 RELATÓRIO FINAL');
    console.log('='.repeat(70) + '\n');
    console.log(`TRT: ${CONFIG.trt.toUpperCase()}`);
    console.log(`Grau: ${CONFIG.grau.toUpperCase()}`);
    console.log(`Agrupador: Pendentes de Manifestação`);
    console.log(`Filtros: Sem prazo (${CONFIG.filtros.join(', ')})`);
    console.log(`Data da raspagem: ${new Date().toISOString()}`);
    console.log(`Total de processos: ${processos.length}`);
    console.log(`Arquivo: ${nomeArquivo}\n`);

    if (processos.length > 0) {
      console.log('Primeiros 3 processos:');
      processos.slice(0, 3).forEach((p, i) => {
        console.log(`  ${i + 1}. ${p.numeroProcesso} - ${p.nomeParteAutora}`);
      });
      console.log('');
    }

    console.log('='.repeat(70));
    console.log('✅ RASPAGEM CONCLUÍDA!');
    console.log('='.repeat(70) + '\n');

  } catch (error) {
    console.error('\n❌ Erro:', error.message);
    console.error(error.stack);
  } finally {
    await browser.close();
  }
}

/**
 * Baixa o PDF de um documento e salva localmente
 * @param {Page} page - Página do Puppeteer
 * @param {number} idProcesso - ID do processo
 * @param {number} idDocumento - ID do documento
 * @param {string} numeroProcesso - Número do processo (para nomenclatura)
 * @returns {string|null} - Caminho do arquivo salvo ou null se erro
 */
async function baixarPDF(page, idProcesso, idDocumento, numeroProcesso) {
  try {
    // Gera nome do arquivo: numeroProcesso-idDocumento.pdf
    // Remove caracteres especiais do número do processo
    const nomeArquivo = `${numeroProcesso.replace(/[^0-9]/g, '')}-${idDocumento}.pdf`;
    const caminhoArquivo = path.join(PDF_DIR, nomeArquivo);

    // Baixa o PDF usando a API correta: /conteudo
    const pdfBuffer = await page.evaluate(async (idProc, idDoc) => {
      const response = await fetch(
        `/pje-comum-api/api/processos/id/${idProc}/documentos/id/${idDoc}/conteudo`
      );

      if (!response.ok) {
        return null;
      }

      const blob = await response.blob();
      const reader = new FileReader();

      return new Promise((resolve) => {
        reader.onloadend = () => {
          // Remove o prefixo 'data:application/pdf;base64,'
          const base64 = reader.result.split(',')[1];
          resolve(base64);
        };
        reader.readAsDataURL(blob);
      });
    }, idProcesso, idDocumento);

    if (!pdfBuffer) {
      return null;
    }

    // Converte de base64 para Buffer e salva
    const buffer = Buffer.from(pdfBuffer, 'base64');
    await fs.writeFile(caminhoArquivo, buffer);

    return caminhoArquivo;
  } catch (error) {
    console.log(`      ❌ Erro ao baixar PDF ${numeroProcesso}: ${error.message}`);
    return null;
  }
}

/**
 * Enriquece dados de um processo com informações adicionais:
 * - Processos associados (se houver)
 * - Metadados do documento
 * - URL para visualização
 * - Download do PDF
 */
async function enriquecerProcesso(page, processo) {
  // Busca dados via API (dentro do contexto da página)
  const processoEnriquecido = await page.evaluate(async (proc) => {
    const enriquecido = { ...proc };

    // 1. Adiciona URL para visualizar documento
    if (proc.idDocumento) {
      enriquecido.urlDocumento = `https://pje.trt3.jus.br/pjekz/processo/${proc.id}/documento/${proc.idDocumento}`;

      // 2. Busca metadados do documento
      try {
        const docResponse = await fetch(
          `/pje-comum-api/api/processos/id/${proc.id}/documentos/id/${proc.idDocumento}?incluirAssinatura=false&incluirAnexos=false`
        );
        if (docResponse.ok) {
          const docData = await docResponse.json();
          enriquecido.documentoMetadados = {
            titulo: docData.titulo,
            tipo: docData.tipo,
            nomeArquivo: docData.nomeArquivo,
            tamanho: docData.tamanho,
            criadoEm: docData.criadoEm,
            juntadoEm: docData.juntadoEm,
          };
        }
      } catch (e) {
        // Ignora erro - campo fica undefined
      }
    }

    // 3. Busca processos associados (se houver)
    if (proc.temAssociacao) {
      try {
        const assocResponse = await fetch(
          `/pje-comum-api/api/processos/id/${proc.id}/associados?pagina=1&tamanhoPagina=100&ordenacaoCrescente=true`
        );
        if (assocResponse.ok) {
          const assocData = await assocResponse.json();
          enriquecido.processosAssociados = assocData.resultado || [];
        }
      } catch (e) {
        // Ignora erro - campo fica undefined
      }
    }

    return enriquecido;
  }, processo);

  // 4. Baixa o PDF (fora do contexto da página)
  if (processoEnriquecido.idDocumento) {
    const caminhoPDF = await baixarPDF(
      page,
      processoEnriquecido.id,
      processoEnriquecido.idDocumento,
      processoEnriquecido.numeroProcesso
    );

    if (caminhoPDF) {
      processoEnriquecido.pdfLocal = caminhoPDF;
    }
  }

  return processoEnriquecido;
}

/**
 * Raspa processos aplicando os filtros configurados
 */
async function rasparComFiltros(page, idAdvogado) {
  const todosProcessos = [];
  let paginaAtual = 1;
  const tamanhoPagina = 100;
  let totalPaginas = null;

  while (true) {
    console.log(`   Página ${paginaAtual}/${totalPaginas || '?'}...`);

    const resultado = await page.evaluate(async (id, cfg, pagina, tamanho) => {
      try {
        // Monta URL com filtros
        const params = new URLSearchParams();

        // Adiciona filtros (pode ser um ou mais)
        cfg.filtros.forEach(filtro => params.append('agrupadorExpediente', filtro));

        // Adiciona parâmetros da API
        params.append('pagina', pagina);
        params.append('tamanhoPagina', tamanho);
        params.append('tipoPainelAdvogado', cfg.api.tipoPainelAdvogado);
        params.append('ordenacaoCrescente', cfg.api.ordenacaoCrescente);
        params.append('idPainelAdvogadoEnum', cfg.api.idPainelAdvogadoEnum);

        const url = `/pje-comum-api/api/paineladvogado/${id}/processos?${params.toString()}`;
        const response = await fetch(url);

        if (!response.ok) {
          return { error: `HTTP ${response.status}` };
        }

        return await response.json();
      } catch (e) {
        return { error: e.message };
      }
    }, idAdvogado, CONFIG, paginaAtual, tamanhoPagina);

    if (resultado.error) {
      console.error(`   ❌ Erro na página ${paginaAtual}: ${resultado.error}`);
      break;
    }

    // Primeira página - descobre total de páginas
    if (totalPaginas === null) {
      totalPaginas = resultado.qtdPaginas || 1;
      console.log(`   Total de páginas: ${totalPaginas}`);
      console.log(`   Total de processos: ${resultado.totalRegistros || '?'}\n`);
    }

    // Adiciona processos desta página
    if (resultado.resultado && Array.isArray(resultado.resultado)) {
      console.log(`   ✅ ${resultado.resultado.length} processos capturados`);

      // Enriquece cada processo com dados adicionais
      console.log(`   🔍 Enriquecendo processos com dados adicionais...`);
      for (const processo of resultado.resultado) {
        const processoEnriquecido = await enriquecerProcesso(page, processo);
        todosProcessos.push(processoEnriquecido);

        // Delay pequeno entre cada processo para não sobrecarregar
        await delay(100);
      }
      console.log(`   ✅ Enriquecimento concluído`);
    }

    // Verifica se chegou na última página
    if (paginaAtual >= totalPaginas) {
      break;
    }

    paginaAtual++;

    // Delay entre requisições
    await delay(500);
  }

  return todosProcessos;
}

// Executa
rasparPendentesManifestation().catch(console.error);
