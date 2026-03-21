<template>
  <div class="app">
    <h2>AI 表格编号核对工具（精准提取版）</h2>


    <div class="card" v-loading="loading">
      <h3>1. 上传表格照片</h3>
      <input type="file" accept="image/*" multiple @change="onImageSelect" />
      <div v-if="imgIds.length" class="msg">
        识别到编号：{{ imgIds.join('、') }}
      </div>
      <div v-if="aiError" class="error">
        识别失败：{{ aiError }}
      </div>
    </div>

    <div class="card">
      <h3>2. 上传 Excel</h3>
      <input type="file" multiple accept=".xls,.xlsx" @change="onExcelSelect" />
      <div v-if="excelIds.length" class="msg">
        Excel 编号总数：{{ excelIds.length }}
      </div>
      <div v-if="excelFiles.length" class="msg">
        已上传文件：
        <span v-for="(f, i) in excelFiles" :key="i">
          {{ f.name }}（{{ f.rows.length }} 行，{{ f.ids.length }} 编号）<span v-if="i < excelFiles.length - 1">、</span>
        </span>
      </div>
    </div>

    <div class="card">
      <h3>3. 对比结果</h3>
      <div v-if="missingIds.length" class="missing">
        Excel 有但图片没有：{{ missingIds.join('、') }}
      </div>
      <br/>
      <div v-if="imgOnlyIds.length" class="missing">
        图片有但 Excel 没有：{{ imgOnlyIds.join('、') }}
      </div>
      <div v-if="!missingIds.length && !imgOnlyIds.length" class="ok">全部都在！</div>
    </div>

    <div class="card">
        <div style="margin-bottom:8px">
          导出模式：
          <label><input type="radio" v-model="exportMode" value="merged" /> 合并导出（默认）</label>
          <label style="margin-left:12px"><input type="radio" v-model="exportMode" value="separate" /> 分文件导出（每文件一个 sheet）</label>
        </div>
        <button @click="doExport" :disabled="!excelFiles.length">
          导出【缺失编号高亮】Excel
        </button>
      </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import * as XLSX from 'xlsx'
import ExcelJS from 'exceljs'
import { Loading } from 'element-plus'

// 从构建时注入的环境变量读取（Vue CLI 使用 VUE_APP_ 前缀）
const API_KEY = process.env.VUE_APP_API_KEY || '';
const API_URL = process.env.VUE_APP_API_URL || '';

// 核心数据
const imgIds = ref([])       // 图片识别的编号
const excelFiles = ref([])   // 每个上传的 Excel：{ name, rows, ids }
const excelIds = ref([])     // 合并去重后的所有 Excel 编号
const aiError = ref('')      // AI识别错误提示
const loading = ref(false)   // 加载状态
const exportMode = ref('merged') // 导出模式：'merged' 或 'separate'

// 缺失编号：Excel有但图片没有
const missingIds = computed(() =>
  excelIds.value.filter(id => !imgIds.value.includes(id))
)

// 反向缺失：图片有但Excel没有
const imgOnlyIds = computed(() =>
  imgIds.value.filter(id => !excelIds.value.includes(id))
)

// ==============================================
// 1. 核心：调用豆包多模态API，精准提取编号
// ==============================================
async function callDoubaoVision(base64Image) {
  loading.value = true;
  // 精准提取的Prompt（核心！）
  const prompt = `你是一个表格数据提取助手。
请处理这张表格图片：
1. 找到「需求编号-详细功能」这一列
2. 忽略序号列、二维码/条形码图片
3. 只提取该列中每一行的**纯数字编号**（不要任何文字、符号、二维码内容）
4. 以 JSON 数组格式返回，例如：[2511240108, 2511240106]
5. 不要额外解释，只返回 JSON 数组`;

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: 'doubao-seed-1-6-vision-250815', // 豆包多模态模型
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: base64Image } }
            ]
          }
        ]
      })
    });

    const data = await res.json();
    
    // 处理AI返回结果
    if (data.choices?.[0]?.message?.content) {
      const result = data.choices[0].message.content;
      // 解析纯数字数组
      const ids = JSON.parse(result);
      loading.value = false;
      // 过滤确保都是数字（防AI返回脏数据）
      return ids.filter(id => !isNaN(Number(id)));
    } else {
      throw new Error('AI未返回有效数据');
    }
  } catch (err) {
    aiError.value = err.message;
    loading.value = false;
    return [];
  }
}

// 火山引擎豆包API调用（正确）
async function callDoubaoVision2(base64Image) {
  const API_KEY = '你的火山API Key';
  const SECRET_KEY = '你的火山Secret Key';
  const ENDPOINT_ID = '你创建的推理接入点ID'; // 关键！

  const prompt = `提取表格中“需求编号-详细功能”列的纯数字编号，返回JSON数组，不要二维码和文字。`;

  const res = await fetch(`https://ark.cn-beijing.volces.com/api/v3/endpoints/${ENDPOINT_ID}/invoke`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: 'doubao-3-8k', // 用已开通的模型名
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: base64Image } }
        ]
      }],
      temperature: 0
    })
  });
  return await res.json();
}
// ==============================================
// 2. 选择图片 → 转Base64 → 调用AI
// ==============================================
async function onImageSelect(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  // 清空之前的状态
  imgIds.value = [];
  aiError.value = '';

  // 转Base64
  const base64 = await toBase64(file);
  // 调用AI提取编号
  const ids = await callDoubaoVision(base64);
  console.log('AI识别结果', ids);
  imgIds.value = ids;
}

// ==============================================
// 3. 上传Excel → 读取编号列
// ==============================================
function onExcelSelect(e) {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;

  // 清空之前的状态
  excelFiles.value = [];
  excelIds.value = [];

  // 并行解析所有文件
  Promise.all(files.map(file => new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsArrayBuffer(file);
    reader.onload = ev => {
      try {
        const data = new Uint8Array(ev.target.result);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
        const ids = rows
          .filter(r => r?.[2] != null)
          .map(r => Number(r[2]))
          .filter(id => !isNaN(id));
        resolve({ name: file.name, rows, ids });
      } catch (err) {
        resolve({ name: file.name, rows: [], ids: [] });
      }
    };
    reader.onerror = () => resolve({ name: file.name, rows: [], ids: [] });
  }))).then(parsed => {
    // 过滤掉空的解析结果
    excelFiles.value = parsed.filter(p => p.rows && p.rows.length);
    // 合并去重所有编号
    excelIds.value = Array.from(new Set(excelFiles.value.flatMap(p => p.ids)));
  });
}

// ==============================================
// 4. 导出高亮Excel
// ==============================================
async function doExport() {
  const wb = new ExcelJS.Workbook();

  // 合并导出所有上传的 Excel（默认策略）或分文件导出
  const files = excelFiles.value && excelFiles.value.length ? excelFiles.value : [];
  const idColIndex = 2; // 第三列，0-based 下标（在原始行中）

  const isHeaderRow = (row) => {
    if (!row || !row.length) return false;
    return row.some(c => typeof c === 'string' && c.trim() !== '' && isNaN(Number(c)));
  };

  if (exportMode.value === 'merged') {
    const ws = wb.addWorksheet('核对结果');

    if (files.length) {
      // 计算最大列数以便统一列宽和填充缺失列
      let maxCols = 0;
      files.forEach(f => f.rows.forEach(r => { if (r && r.length > maxCols) maxCols = r.length; }));

      // 写入表头：在最前面插入 sourceFile 列
      const firstFile = files[0];
      const firstHasHeader = firstFile.rows && firstFile.rows.length && isHeaderRow(firstFile.rows[0]);
      const headerBase = firstHasHeader ? firstFile.rows[0] : Array.from({ length: maxCols }, (_, i) => `列${i+1}`);
      const header = ['来源文件', ...Array.from({ length: maxCols }, (_, i) => headerBase[i] ?? `列${i+1}`)];
      ws.addRow(header);

      // 写入每个文件的数据行
      files.forEach(f => {
        const hasHeader = f.rows && f.rows.length && isHeaderRow(f.rows[0]);
        f.rows.forEach((r, idx) => {
          if (idx === 0 && hasHeader) return; // 跳过每个文件的表头（我们只保留第一个文件的表头）
          const padded = Array.from({ length: maxCols }, (_, i) => (r && r[i] != null) ? r[i] : '');
          const added = ws.addRow([f.name, ...padded]);
          const rawId = padded[idColIndex];
          const idNum = Number(rawId);
          if (!isNaN(idNum) && missingIds.value.includes(idNum)) {
            added.eachCell(cell => {
              cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFFFAAAA' }
              };
            });
          }
        });
      });
    } else {
      // 兜底：只导出编号列
      ws.columns = [{ header: '需求编号', key: 'id' }];
      excelIds.value.forEach(id => {
        const row = ws.addRow({ id });
        if (missingIds.value.includes(id)) {
          row.eachCell(cell => {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFFFAAAA' }
            };
          });
        }
      });
    }
  } else {
    // 分文件导出：为每个文件创建单独的 sheet
    if (files.length) {
      files.forEach(f => {
        // sheet 名称需清理并不超过 31 字符，且保证唯一
        let baseName = f.name.replace(/\.[^.]+$/, '');
        baseName = baseName.replace(/[\\/*?:\[\]]/g, '_').slice(0, 31) || 'sheet';
        let finalName = baseName;
        let counter = 1;
        while (wb.getWorksheet(finalName)) {
          const suffix = `_${counter++}`;
          const maxBaseLen = 31 - suffix.length;
          finalName = baseName.slice(0, maxBaseLen) + suffix;
        }
        const sheet = wb.addWorksheet(finalName);

        // 计算本文件最大列数
        let maxCols = 0;
        f.rows.forEach(r => { if (r && r.length > maxCols) maxCols = r.length; });

        const hasHeader = f.rows && f.rows.length && isHeaderRow(f.rows[0]);
        const headerBase = hasHeader ? f.rows[0] : Array.from({ length: maxCols }, (_, i) => `列${i+1}`);
        const header = Array.from({ length: maxCols }, (_, i) => headerBase[i] ?? `列${i+1}`);
        sheet.addRow(header);

        f.rows.forEach((r, idx) => {
          if (idx === 0 && hasHeader) return;
          const padded = Array.from({ length: maxCols }, (_, i) => (r && r[i] != null) ? r[i] : '');
          const added = sheet.addRow(padded);
          const rawId = padded[idColIndex];
          const idNum = Number(rawId);
          if (!isNaN(idNum) && missingIds.value.includes(idNum)) {
            added.eachCell(cell => {
              cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFFFAAAA' }
              };
            });
          }
        });
      });
    }
  }

  // 下载文件
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = '需求编号核对结果.xlsx';
  a.click();
  URL.revokeObjectURL(url); // 释放内存
}

// ==============================================
// 工具函数：文件转Base64
// ==============================================
function toBase64(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}
</script>

<style scoped>
.app {
  max-width: 700px;
  margin: 40px auto;
  padding: 0 20px;
  font-family: Arial, sans-serif;
}
.card {
  margin: 16px 0;
  padding: 20px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
}
.msg {
  margin-top: 8px;
  color: #333;
  line-height: 1.5;
}
.error {
  margin-top: 8px;
  color: #f44336;
  font-weight: bold;
}
.missing {
  color: #f44336;
  font-weight: bold;
  line-height: 1.5;
}
.ok {
  color: #4caf50;
  font-weight: bold;
}
button {
  padding: 10px 24px;
  background: #42b983;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 16px;
}
button:disabled {
  background: #cccccc;
  cursor: not-allowed;
}
</style>