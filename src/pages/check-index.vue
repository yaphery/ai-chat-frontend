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
      <input type="file" accept=".xls,.xlsx" @change="onExcelSelect" />
      <div v-if="excelIds.length" class="msg">
        Excel 编号总数：{{ excelIds.length }}
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
      <button @click="doExport" :disabled="!excelIds.length">
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
const excelIds = ref([])     // Excel里的编号
const excelRows = ref([])    // 原始 Excel 行数据（二维数组）
const aiError = ref('')      // AI识别错误提示
const loading = ref(false)   // 加载状态

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
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.readAsArrayBuffer(file);
  reader.onload = ev => {
    const data = new Uint8Array(ev.target.result);
    const wb = XLSX.read(data, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

    // 保存原始行数据，后面导出时还原原表内容
    excelRows.value = rows;

    // 读取第三列作为编号（可根据你的Excel调整下标）
    const ids = rows
      .filter(r => r?.[2] != null)
      .map(r => Number(r[2])) // 转数字，兼容文本格式
      .filter(id => !isNaN(id)); // 只保留数字编号
    excelIds.value = ids;
  };
}

// ==============================================
// 4. 导出高亮Excel
// ==============================================
async function doExport() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('核对结果');

  // 如果我们有原始行数据，按原样写入并高亮缺失编号整行；否则退回到只输出编号列
  const rows = excelRows.value && excelRows.value.length ? excelRows.value : [];
  const idColIndex = 2; // 第三列，0-based 下标

  if (rows.length) {
    // 将每一行写入工作表，保持原有列数
    rows.forEach((r, idx) => {
      const added = ws.addRow(r);
      // 跳过表头（通常第一行是表头），只对数据行进行高亮判断
      if (idx > 0) {
        const rawId = r[idColIndex];
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
      }
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