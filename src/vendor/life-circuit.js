/* Adapted from xiaoxuhui/logic-circuit.
MIT License

Copyright (c) 2026 xiaoxuhui

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

*/
import tileCells from './life-timed-tiles.js';

  'use strict';

  const SIZE = 150;
  // One half tick is 30 Life generations. Ships enter horizontal ports at phase 0
  // and vertical ports at phase 30. Tile delays include that phase difference.
  const HALF_TICK = 30, WIRE = 10, TURN = 11, JOG = 24, SLOW_EXTRA = 8;
  const turns = ['right', 'medium', 'slow'];
  const gateDelays = { AND: [10, 11], OR: [14, 11], NOT: [14] };
  const eaterRLE = '2b2o$2bo$obo$2o!';
  const arrow = [[0, 0], [10, 0], [20, 0], [30, 0], [20, -10], [20, 10]];

  function build({ inputs, outputs, registers: registerExpressions }) {
    const updates = outputs.filter(output => output.delayId);
    const signal = new Map(), producers = [];
    let row = 0;
    function visit(root) {
      const stack = [root];
      while (stack.length) {
        const expression = stack.at(-1);
        if (signal.has(expression)) { stack.pop(); continue; }
        const pending = expression.args?.find(arg => !signal.has(arg));
        if (pending) { stack.push(pending); continue; }
        const args = (expression.args || []).map(arg => signal.get(arg));
        const value = expression.op === 'AND' ? args.every(arg => arg.value)
          : expression.op === 'OR' ? args.some(arg => arg.value)
          : expression.op === 'NOT' ? !args[0].value : !!(expression.value ?? expression.defaultValue);
        const producer = { expression, args, value, row, edges: [], shift: 0 };
        producers.push(producer);
        signal.set(expression, producer);
        row += args.length === 2 ? 4 : 2;
        stack.pop();
      }
    }
    registerExpressions.forEach(visit);
    outputs.forEach(output => visit(output.expression));
    const sources = new Map(registerExpressions.map(expression => [expression.delayId, signal.get(expression)]));
    const externalInputs = new Set(inputs.map(input => input.expression));

    function connect(from, to, targetRow, port) {
      const edge = { from, to, row: targetRow, port, padding: 0 };
      from.edges.push(edge);
      return edge;
    }
    for (const item of producers) item.incoming = item.args.map((from, port) => connect(from, item, item.row + 2 * port, port));
    const sinks = outputs.map((output, index) => ({ ...output, row: row + 2 * index }));
    for (const sink of sinks) sink.edge = connect(signal.get(sink.expression), sink, sink.row, 0);
    for (const producer of producers) producer.edges.sort((a, b) => a.row - b.row);

    function relativeDelay(edge) {
      // Relative to a straight wire, the vertical branch costs one half tick,
      // a tap costs one or three, and each adjustable jog starts at 24.
      return 1 + (edge.from.edges.at(-1) === edge ? 1 : 3) + JOG;
    }
    let column = 0;
    for (const producer of producers) {
      const gate = gateDelays[producer.expression.op];
      const arrivals = producer.incoming.map(edge => {
        // Port B approaches from two rows below, then turns north into the gate.
        const approach = edge.port ? 2 * WIRE + TURN + gate[1] : gate[0] - WIRE;
        return edge.from.shift + relativeDelay(edge) + approach;
      });
      producer.shift = Math.max(0, ...arrivals);
      producer.incoming.forEach((edge, index) => { edge.padding = producer.shift - arrivals[index]; });
      if (producer !== producers[0]) column += 9 + Math.ceil(Math.max(0, ...producer.incoming.map(edge => edge.padding)) / SLOW_EXTRA);
      producer.column = column;
    }
    const sinkColumn = column + 9;
    for (const sink of sinks) {
      sink.column = sinkColumn;
      sink.shift = sink.edge.from.shift + relativeDelay(sink.edge);
    }

    const cells = [], returnPorts = [], gates = [], portWords = [];
    // Port lanes are on even rows. The tile directly below each port is clear of traffic.
    function markPort(word, column, row) {
      portWords.push({ word, x: column * SIZE + 12, y: (row + 1) * SIZE + 28 });
    }
    function paint(x, y, tile) {
      for (const packed of tileCells(tile)) cells.push([x * SIZE + packed % SIZE, y * SIZE + Math.floor(packed / SIZE)]);
      if (cells.length > 4000000) throw new Error('图案超过当前浏览器的 400 万活细胞转换预算，请减少纸带范围。');
    }
    function put(x, y, kind, rotation, mask) { paint(x, y, kind + Number(mask) + rotation); }
    function wire(x, y, direction, value) { if (value) paint(x, y, direction); }
    function block(x, y) { cells.push([x,y],[x+1,y],[x,y+1],[x+1,y+1]); if (cells.length > 4000000) throw new Error('图案超过当前浏览器的转换预算，请减少纸带范围。'); }
    function returnWire(x, y, direction, rotation, value) {
      wire(x, y, direction, value);
      if ((x + y) % 5 !== 0) return;
      for (const [offsetX, offsetY] of arrow) {
        let localX = 25 + offsetX, localY = 112 + offsetY;
        for (let turn = 0; turn < rotation; turn++) [localX, localY] = [SIZE - 1 - localY, localX];
        block(x * SIZE + localX, y * SIZE + localY);
      }
    }

    for (const producer of producers) {
      const { column: x, row: y, value, expression, args, edges } = producer;
      if (expression.op) put(x, y, expression.op.toLowerCase(), 0, args.reduce((mask, arg, bit) => mask | Number(arg.value) << bit, 0));
      else if (expression.delayId) wire(x, y, 'e', value);
      else if (externalInputs.has(expression)) {
        // The preceding tile always emits. The port tile either passes the stream or eats it.
        put(x - 1, y, 'not', 0, 0);
        if (value) wire(x, y, 'e', true);
        else put(x, y, 'end', 0, 1);
      } else if (value) put(x, y, 'not', 0, 0);
      else put(x, y, 'end', 0, 0);
      if (expression.gateId) gates.push({ id: expression.gateId, label: expression.label, x: x * SIZE, y: y * SIZE });
      if (!edges.length) { put(x + 1, y, 'end', 0, value); continue; }
      put(x + 1, y, 'fork', 0, value);
      put(x + 2, y, 'end', 0, value);
      let cursor = y + 1;
      for (const edge of edges) {
        for (; cursor < edge.row; cursor++) wire(x + 1, cursor, 's', value);
        put(x + 1, edge.row, edge === edges.at(-1) ? 'left' : 'tap', 1, value);
        cursor = edge.row + 1;
      }
    }
    for (const producer of producers) for (const edge of producer.edges) {
      const { row: y, padding, to } = edge, value = producer.value, end = to.column, jog = end - 4;
      const slow = Math.floor(padding / SLOW_EXTRA), extraTurns = padding % SLOW_EXTRA / 2;
      for (let x = producer.column + 2; x < jog - slow; x++) wire(x, y, 'e', value);
      for (let x = jog - slow; x < jog; x++) put(x, y, 'delay', 0, value);
      put(jog, y, turns[Math.min(2, extraTurns)], 0, value);
      put(jog, y + 1, 'left', 1, value);
      wire(jog + 1, y + 1, 'e', value);
      put(jog + 2, y + 1, 'left', 0, value);
      put(jog + 2, y, turns[Math.max(0, extraTurns - 2)], 3, value);
      wire(jog + 3, y, 'e', value);
      if (edge.port) { put(end, y, 'left', 0, value); wire(end, y - 1, 'n', value); }
    }

    const sinkById = new Map(sinks.filter(sink => sink.delayId).map(sink => [sink.delayId, sink]));
    const routes = updates.map((update, index) => {
      const sink = sinkById.get(update.delayId), source = sources.get(update.delayId), lane = updates.length - 1 - index;
      const left = -4 - lane, right = sinkColumn + 5 + lane, bottom = row + 2 * sinks.length + 3 + lane, top = source.row;
      const straight = right - sinkColumn + bottom - sink.row - 1 + right - left - 1 + bottom - top - 1 + source.column - left;
      const time = WIRE * (sinkColumn + sink.row + straight - source.column - 1 - top) + sink.shift + 4 * TURN;
      return { sink, source, left, right, bottom, top, time };
    });
    const longest = routes.reduce((time, route) => Math.max(time, route.time), 0);
    const widen = routes.reduce((width, route) => Math.max(width,
      Math.floor((longest - route.time) / SLOW_EXTRA) - (route.right - route.left - 1)), 0);
    const period = (longest + 2 * WIRE * widen) * HALF_TICK;
    for (const sink of sinks) if (!sink.delayId) put(sinkColumn, sink.row, 'end', 0, sink.edge.from.value);
    for (const route of routes) {
      const { sink, source, left, bottom, top, time } = route, right = route.right + widen, value = source.value;
      const padding = longest - time, slow = Math.floor(padding / SLOW_EXTRA), extraTurns = padding % SLOW_EXTRA / 2;
      for (let x = sinkColumn; x < right; x++) returnWire(x, sink.row, 'e', 0, value);
      put(right, sink.row, turns[Math.min(2, extraTurns)], 0, value);
      for (let y = sink.row + 1; y < bottom; y++) returnWire(right, y, 's', 1, value);
      put(right, bottom, turns[Math.max(0, extraTurns - 2)], 1, value);
      for (let x = right - 1; x > right - 1 - slow; x--) put(x, bottom, 'delay', 2, value);
      for (let x = right - 1 - slow; x > left; x--) returnWire(x, bottom, 'w', 2, value);
      put(left, bottom, 'right', 2, value);
      for (let y = top + 1; y < bottom; y++) returnWire(left, y, 'n', 3, value);
      put(left, top, 'right', 3, value);
      for (let x = left + 1; x < source.column; x++) returnWire(x, top, 'e', 0, value);
      const input = { x: source.column * SIZE + 28, y: top * SIZE + 114 };
      for (const [x, y] of [[0,0],[8,0],[0,8],[8,8]]) block(input.x + x, input.y + y);
      returnPorts.push({ label: sink.label, output: { x: sinkColumn * SIZE, y: sink.row * SIZE + 71 }, input });
    }

    const probes = sinks.map(({ label, row, delayId }) => {
      const x = sinkColumn * SIZE, y = row * SIZE + 71;
      if (!delayId) markPort('OUTPUT', sinkColumn, row);
      block(x - 14, y - 24);
      block(x - 14, y + 24);
      return { label, x, y, ...(delayId ? { delayId } : {}) };
    });
    const inputPorts = inputs.map(({ label, value, expression }, index) => {
      const producer = signal.get(expression);
      const column = producer ? producer.column : index % 8;
      const row = producer ? producer.row : -1 - Math.floor(index / 8);
      const x = column * SIZE + 10, y = row * SIZE + 68;
      portWords.push({ word: 'INPUT', x: x + 10, y: y + 42 });
      if (!producer) {
        put(column, row, 'end', 0, 0);
        return { label, value, x, y, routed: false };
      }
      block(x - 8, y + 13);
      block(x + 11, y - 12);
      return { label, value, x, y, routed: true, switchRLE: eaterRLE };
    });
    const registers = updates.map(({ delayId: id, initialValue }) => ({ id, initialValue, gun: null }));
    // Include the source tile and the longest path from the input bank to any output.
    const arrival = sinks.reduce((latest,sink) => Math.max(latest,WIRE*(sink.column+sink.row)+sink.shift),0);
    const generation = period ? 0 : Math.ceil((arrival+2*WIRE)*HALF_TICK/60)*60;
    const registerPorts = registerExpressions.map(expression => { const p = sources.get(expression.delayId); return { id: expression.delayId, x: p.column * SIZE, y: p.row * SIZE + 71 }; });
    return { cells, registerPorts, inputs: inputPorts, outputs: probes, registers, generation, period, signal: 'lwss',
      loop: updates.length>0, feedback: updates.length ? 'timed' : null, returnPorts, gates, portWords };
  }


export { build };
