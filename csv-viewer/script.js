document
  .getElementById('csvFileInput')
  .addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      dynamicTyping: true,
      complete: function (results) {
        displayTable(results.data);
      },
    });
  });

function displayTable(data) {
  const container = document.getElementById('tableContainer');
  container.innerHTML = '';

  if (!data.length) {
    container.innerHTML = '<p>No data found.</p>';
    return;
  }

  const table = document.createElement('table');
  const thead = table.createTHead();
  const tbody = table.createTBody();

  const headers = Object.keys(data[0]);
  const headerRow = thead.insertRow();
  headers.forEach((header) => {
    const th = document.createElement('th');
    th.textContent = header;
    headerRow.appendChild(th);
  });

  data.forEach((row) => {
    const tr = tbody.insertRow();
    headers.forEach((header) => {
      const td = tr.insertCell();
      td.textContent = row[header];
    });
  });

  container.appendChild(table);
}
