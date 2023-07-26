const { ChartJSNodeCanvas } = require("chartjs-node-canvas");

//https://github.com/Automattic/node-canvas/issues/1893#issuecomment-1096988007

async function create_price_graph(ohlcv_list) {
  ohlcv_list = ohlcv_list.slice(-7);
  const chartJSNodeCanvas = new ChartJSNodeCanvas({
    width: 650,
    height: 420,
    backgroundColour: "white"
  });
  let data = [];
  let labels = [];
  for (let i=0; i < ohlcv_list.length; i++) {
    let ohlcv_day = ohlcv_list[i];
    for (let j=0; j < 4; j++) {
      data.push({ x: i*4+j, y: ohlcv_day[j+1] });
      labels.push(" ");
    }
  }
  const config = {
    type: "line",
    data: {
      datasets: [{
        data: data,
        label: "Astral Credits Price (Last 7 Days)"
      }],
      labels: labels
    },
    options: {
      scales: {
        y: {
          ticks: {
            callback: function(value, index, ticks) {
              return '$'+String(value).slice(0, 8);
            }
          }
        }
      }
    }
  };
  return await chartJSNodeCanvas.renderToBuffer(config);
}

module.exports = {
  create_price_graph: create_price_graph
};
