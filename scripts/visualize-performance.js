/**
 * 성능 테스트 결과 분석 스크립트
 * 
 * 이 스크립트는 성능 테스트의 결과를 분석하고 시각화합니다.
 */

const fs = require('fs');
const path = require('path');
const { PERFORMANCE_TEST_CONFIG } = require('./performance-test');

// 결과 파일 경로
const resultsPath = PERFORMANCE_TEST_CONFIG.outputPath;

// 결과 시각화를 위한 HTML 템플릿
const HTML_TEMPLATE = `
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LG 브라질 A2A 쇼핑 어시스턴트 성능 테스트 결과</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    body {
      font-family: 'Helvetica Neue', Arial, sans-serif;
      margin: 0;
      padding: 20px;
      background-color: #f8f9fa;
      color: #333;
    }
    h1, h2, h3 {
      color: #1f3864;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      background-color: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    .chart-container {
      position: relative;
      height: 400px;
      margin-bottom: 30px;
    }
    .card {
      background-color: white;
      border-radius: 8px;
      box-shadow: 0 2px 5px rgba(0,0,0,0.1);
      padding: 20px;
      margin-bottom: 20px;
    }
    .summary {
      display: flex;
      flex-wrap: wrap;
      gap: 20px;
      margin-bottom: 30px;
    }
    .summary-item {
      flex: 1;
      min-width: 200px;
      background-color: #f1f8ff;
      padding: 15px;
      border-radius: 8px;
      border-left: 4px solid #3498db;
    }
    .summary-item h3 {
      margin-top: 0;
      color: #3498db;
    }
    .summary-value {
      font-size: 24px;
      font-weight: bold;
      margin: 10px 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }
    th, td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid #e2e8f0;
    }
    th {
      background-color: #f8f9fa;
      font-weight: 600;
    }
    tr:hover {
      background-color: #f8f9fa;
    }
    .success {
      color: #2ecc71;
    }
    .failure {
      color: #e74c3c;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>LG 브라질 A2A 쇼핑 어시스턴트 성능 테스트 결과</h1>
    <p>테스트 실행 일시: <span id="test-date"></span></p>
    
    <div class="summary" id="performance-summary">
      <!-- Summary cards will be inserted here -->
    </div>
    
    <div class="card">
      <h2>실행 시간 비교</h2>
      <div class="chart-container">
        <canvas id="duration-chart"></canvas>
      </div>
    </div>
    
    <div class="card">
      <h2>메모리 사용량 비교</h2>
      <div class="chart-container">
        <canvas id="memory-chart"></canvas>
      </div>
    </div>
    
    <div class="card">
      <h2>상세 결과</h2>
      <table id="results-table">
        <thead>
          <tr>
            <th>테스트 이름</th>
            <th>실행 시간 (ms)</th>
            <th>메모리 사용량 (MB)</th>
            <th>성공 여부</th>
          </tr>
        </thead>
        <tbody>
          <!-- Results will be inserted here -->
        </tbody>
      </table>
    </div>
  </div>
  
  <script>
    // Results data will be inserted here
    const testResults = RESULTS_DATA;
    
    document.getElementById('test-date').textContent = new Date(testResults[testResults.length - 1].timestamp).toLocaleString();
    
    // Process the latest test results
    const latestResults = testResults[testResults.length - 1].results;
    
    // Group results by test type
    const testGroups = {};
    latestResults.forEach(result => {
      const match = result.name.match(/^(.*) Test #\\d+$/);
      if (match) {
        const groupName = match[1];
        if (!testGroups[groupName]) {
          testGroups[groupName] = [];
        }
        testGroups[groupName].push(result);
      }
    });
    
    // Calculate averages for each group
    const groupAverages = {};
    Object.entries(testGroups).forEach(([groupName, groupResults]) => {
      const avgDuration = groupResults.reduce((sum, r) => sum + r.duration, 0) / groupResults.length;
      const avgMemory = groupResults.reduce((sum, r) => sum + r.memoryUsed, 0) / groupResults.length;
      const successRate = groupResults.filter(r => r.success).length / groupResults.length * 100;
      
      groupAverages[groupName] = {
        avgDuration,
        avgMemory,
        successRate
      };
    });
    
    // Calculate overall averages
    const overallAvgDuration = latestResults.reduce((sum, r) => sum + r.duration, 0) / latestResults.length;
    const overallAvgMemory = latestResults.reduce((sum, r) => sum + r.memoryUsed, 0) / latestResults.length;
    const overallSuccessRate = latestResults.filter(r => r.success).length / latestResults.length * 100;
    
    // Create summary cards
    const summaryEl = document.getElementById('performance-summary');
    
    // Overall summary
    summaryEl.innerHTML += `
      <div class="summary-item">
        <h3>전체 평균</h3>
        <div class="summary-value">${overallAvgDuration.toFixed(2)} ms</div>
        <p>평균 실행 시간</p>
      </div>
      <div class="summary-item">
        <h3>메모리 사용량</h3>
        <div class="summary-value">${overallAvgMemory.toFixed(2)} MB</div>
        <p>평균 메모리 사용량</p>
      </div>
      <div class="summary-item">
        <h3>성공률</h3>
        <div class="summary-value">${overallSuccessRate.toFixed(2)}%</div>
        <p>테스트 성공률</p>
      </div>
    `;
    
    // Generate charts
    const ctx1 = document.getElementById('duration-chart').getContext('2d');
    const durationChart = new Chart(ctx1, {
      type: 'bar',
      data: {
        labels: Object.keys(groupAverages),
        datasets: [{
          label: '평균 실행 시간 (ms)',
          data: Object.values(groupAverages).map(v => v.avgDuration),
          backgroundColor: 'rgba(54, 162, 235, 0.6)',
          borderColor: 'rgba(54, 162, 235, 1)',
          borderWidth: 1
        }]
      },
      options: {
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: '실행 시간 (ms)'
            }
          }
        },
        responsive: true,
        maintainAspectRatio: false
      }
    });
    
    const ctx2 = document.getElementById('memory-chart').getContext('2d');
    const memoryChart = new Chart(ctx2, {
      type: 'bar',
      data: {
        labels: Object.keys(groupAverages),
        datasets: [{
          label: '평균 메모리 사용량 (MB)',
          data: Object.values(groupAverages).map(v => v.avgMemory),
          backgroundColor: 'rgba(75, 192, 192, 0.6)',
          borderColor: 'rgba(75, 192, 192, 1)',
          borderWidth: 1
        }]
      },
      options: {
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: '메모리 사용량 (MB)'
            }
          }
        },
        responsive: true,
        maintainAspectRatio: false
      }
    });
    
    // Fill the results table
    const tableEl = document.getElementById('results-table').getElementsByTagName('tbody')[0];
    latestResults.forEach(result => {
      const row = tableEl.insertRow();
      
      // Test name
      const cellName = row.insertCell();
      cellName.textContent = result.name;
      
      // Duration
      const cellDuration = row.insertCell();
      cellDuration.textContent = result.duration.toFixed(2);
      
      // Memory usage
      const cellMemory = row.insertCell();
      cellMemory.textContent = result.memoryUsed.toFixed(2);
      
      // Success status
      const cellSuccess = row.insertCell();
      cellSuccess.textContent = result.success ? '성공' : '실패';
      cellSuccess.className = result.success ? 'success' : 'failure';
      
      if (!result.success && result.error) {
        const errorRow = tableEl.insertRow();
        const errorCell = errorRow.insertCell();
        errorCell.colSpan = 4;
        errorCell.style.color = '#e74c3c';
        errorCell.style.fontSize = '14px';
        errorCell.textContent = `오류: ${result.error}`;
      }
    });
  </script>
</body>
</html>
`;

/**
 * 테스트 결과 시각화 함수
 */
function visualizeResults() {
  // 결과 파일 읽기
  if (!fs.existsSync(resultsPath)) {
    console.error(`결과 파일을 찾을 수 없습니다: ${resultsPath}`);
    return;
  }
  
  try {
    // 결과 파일 읽기
    const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
    
    // HTML 파일 생성 경로
    const outputHtmlPath = path.join(path.dirname(resultsPath), 'performance-test-results.html');
    
    // HTML 파일 생성
    const resultHtml = HTML_TEMPLATE.replace('RESULTS_DATA', JSON.stringify(results, null, 2));
    fs.writeFileSync(outputHtmlPath, resultHtml, 'utf8');
    
    console.log(`성능 테스트 결과 시각화가 생성되었습니다: ${outputHtmlPath}`);
  } catch (error) {
    console.error('결과 파일 처리 중 오류 발생:', error);
  }
}

// 메인 함수
async function main() {
  visualizeResults();
}

// 스크립트 실행
if (require.main === module) {
  main().catch(error => {
    console.error('실행 중 오류 발생:', error);
    process.exit(1);
  });
}

module.exports = {
  visualizeResults
};
