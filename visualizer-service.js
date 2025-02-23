const express = require("express");
const cors = require("cors");
const { createCanvas } = require("canvas");
const app = express();
app.use(express.json());
app.use(cors());

const generateNodePositions = (nodes, edges) => {
  const width = 800;
  const height = 600;
  const padding = 50;

  if (nodes.length <= 8) {
    return nodes.map((node, i) => {
      const angle = (i / nodes.length) * 2 * Math.PI;
      const radius = Math.min(width, height) / 2.5 - padding;
      return {
        ...node,
        position: {
          x: width / 2 + radius * Math.cos(angle),
          y: height / 2 + radius * Math.sin(angle),
        },
      };
    });
  }

  let positionedNodes = nodes.map((node) => ({
    ...node,
    position: {
      x: padding + Math.random() * (width - 2 * padding),
      y: padding + Math.random() * (height - 2 * padding),
    },
    velocity: { x: 0, y: 0 },
  }));

  const iterations = 50;
  const k = 30;

  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < positionedNodes.length; i++) {
      let node = positionedNodes[i];
      node.velocity = { x: 0, y: 0 };

      for (let j = 0; j < positionedNodes.length; j++) {
        if (i === j) continue;

        let otherNode = positionedNodes[j];
        let dx = node.position.x - otherNode.position.x;
        let dy = node.position.y - otherNode.position.y;
        let distance = Math.sqrt(dx * dx + dy * dy) || 1;

        let force = k / (distance * distance);
        node.velocity.x += (dx / distance) * force;
        node.velocity.y += (dy / distance) * force;
      }
    }

    for (const edge of edges) {
      const sourceNode = positionedNodes.find(
        (n) =>
          n.id === positionedNodes.find((node) => node.label === edge.from)?.id
      );
      const targetNode = positionedNodes.find(
        (n) =>
          n.id === positionedNodes.find((node) => node.label === edge.to)?.id
      );

      if (sourceNode && targetNode) {
        let dx = targetNode.position.x - sourceNode.position.x;
        let dy = targetNode.position.y - sourceNode.position.y;
        let distance = Math.sqrt(dx * dx + dy * dy) || 1;

        let force = Math.log(distance) * 0.3;
        sourceNode.velocity.x += (dx / distance) * force;
        sourceNode.velocity.y += (dy / distance) * force;
        targetNode.velocity.x -= (dx / distance) * force;
        targetNode.velocity.y -= (dy / distance) * force;
      }
    }

    for (let node of positionedNodes) {
      node.position.x += Math.min(Math.max(node.velocity.x, -10), 10);
      node.position.y += Math.min(Math.max(node.velocity.y, -10), 10);

      node.position.x = Math.max(
        padding,
        Math.min(width - padding, node.position.x)
      );
      node.position.y = Math.max(
        padding,
        Math.min(height - padding, node.position.y)
      );
    }
  }

  return positionedNodes;
};

app.post("/generate-visual", (req, res) => {
  try {
    const { nodes, edges } = req.body;

    if (!nodes || !edges) {
      return res.status(400).json({ error: "Данные не предоставлены" });
    }

    console.log("Generating visualization for:", {
      nodeCount: nodes.length,
      edgeCount: edges.length,
    });

    const positionedNodes = generateNodePositions(nodes, edges);

    const flowNodes = positionedNodes.map((node) => ({
      id: String(node.id),
      type: "customNode",
      position: node.position,
      data: {
        label: node.label,
        connections: edges.filter(
          (e) => e.from === node.label || e.to === node.label
        ).length,
      },
    }));

    const flowEdges = edges
      .map((edge) => {
        const sourceNode = nodes.find((n) => n.label === edge.from);
        const targetNode = nodes.find((n) => n.label === edge.to);

        if (!sourceNode || !targetNode) return null;

        return {
          id: `e${edge.id}`,
          source: String(sourceNode.id),
          target: String(targetNode.id),
          animated: true,
          style: {
            stroke: getEdgeColor(edge),
            strokeWidth: 2,
          },
          markerEnd: {
            type: "arrowclosed",
            color: getEdgeColor(edge),
          },
        };
      })
      .filter(Boolean);

    const result = {
      nodes: flowNodes,
      edges: flowEdges,
      layout: "force-directed",
      theme: "light",
      metadata: {
        totalNodes: nodes.length,
        totalEdges: edges.length,
        graphDensity:
          nodes.length > 1
            ? (edges.length / (nodes.length * (nodes.length - 1))) * 2
            : 0,
      },
    };

    res.json(result);
  } catch (error) {
    console.error("Visualization error:", error);
    res.status(500).json({
      error: "Ошибка при генерации визуализации",
      details: error.message,
    });
  }
});
app.post("/export-graph-image", (req, res) => {
  try {
    const { nodes, edges } = req.body;

    if (!nodes || !edges) {
      return res.status(400).json({ error: "Данные не предоставлены" });
    }

    // Используем переданные позиции узлов, если они есть, иначе генерируем
    const positionedNodes =
      nodes.map((node) => ({
        ...node,
        position: node.position || { x: 0, y: 0 },
      })).length > 0
        ? nodes
        : generateNodePositions(nodes, edges);

    // Размеры узлов
    const nodeWidth = 100;
    const nodeHeight = 50;
    const padding = 50; // Отступы от краев

    // Вычисляем границы графа
    const minX = Math.min(
      ...positionedNodes.map((n) => n.position.x - nodeWidth / 2)
    );
    const maxX = Math.max(
      ...positionedNodes.map((n) => n.position.x + nodeWidth / 2)
    );
    const minY = Math.min(
      ...positionedNodes.map((n) => n.position.y - nodeHeight / 2)
    );
    const maxY = Math.max(
      ...positionedNodes.map((n) => n.position.y + nodeHeight / 2)
    );

    // Вычисляем размеры холста с учетом отступов
    const canvasWidth = maxX - minX + 2 * padding;
    const canvasHeight = maxY - minY + 2 * padding;

    // Ограничиваем максимальный размер
    const maxSize = 2000;
    let scale = 1;
    if (canvasWidth > maxSize || canvasHeight > maxSize) {
      scale = Math.min(maxSize / canvasWidth, maxSize / canvasHeight);
    }

    const finalWidth = Math.max(300, canvasWidth * scale);
    const finalHeight = Math.max(300, canvasHeight * scale);

    // Создаем холст
    const canvas = createCanvas(finalWidth, finalHeight);
    const ctx = canvas.getContext("2d");

    // Заливаем белый фон
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, finalWidth, finalHeight);

    // Применяем масштабирование и смещение
    ctx.scale(scale, scale);
    const offsetX = -minX + padding;
    const offsetY = -minY + padding;
    ctx.translate(offsetX, offsetY);

    // Рисуем связи (edges) без стрелок
    ctx.strokeStyle = "#555";
    ctx.lineWidth = 2 / scale;
    edges.forEach((edge) => {
      const sourceNode = positionedNodes.find((n) => n.label === edge.from);
      const targetNode = positionedNodes.find((n) => n.label === edge.to);

      if (sourceNode && targetNode) {
        const startX = sourceNode.position.x;
        const startY = sourceNode.position.y;
        const endX = targetNode.position.x;
        const endY = targetNode.position.y;

        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();
      }
    });

    // Рисуем узлы
    positionedNodes.forEach((node) => {
      ctx.fillStyle = "#f0f0f0";
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 1 / scale;
      const x = node.position.x - nodeWidth / 2;
      const y = node.position.y - nodeHeight / 2;

      ctx.fillRect(x, y, nodeWidth, nodeHeight);
      ctx.strokeRect(x, y, nodeWidth, nodeHeight);

      ctx.fillStyle = "#000";
      ctx.font = `${16 / scale}px Arial`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(node.label, node.position.x, node.position.y);
    });

    // Рисуем стрелки с учетом границ узлов
    ctx.fillStyle = "#000";
    edges.forEach((edge) => {
      const sourceNode = positionedNodes.find((n) => n.label === edge.from);
      const targetNode = positionedNodes.find((n) => n.label === edge.to);

      if (sourceNode && targetNode) {
        let startX = sourceNode.position.x;
        let startY = sourceNode.position.y;
        let endX = targetNode.position.x;
        let endY = targetNode.position.y;

        // Вычисляем точку пересечения с границей целевого узла
        const dx = endX - startX;
        const dy = endY - startY;
        const angle = Math.atan2(dy, dx);

        // Определяем границы узла
        const targetLeft = targetNode.position.x - nodeWidth / 2;
        const targetRight = targetNode.position.x + nodeWidth / 2;
        const targetTop = targetNode.position.y - nodeHeight / 2;
        const targetBottom = targetNode.position.y + nodeHeight / 2;

        // Находим точку пересечения линии с прямоугольником узла
        const slope = dy / dx;
        let intersectX, intersectY;

        if (Math.abs(dx) > Math.abs(dy)) {
          // Пересечение с левой или правой стороной
          intersectX = dx > 0 ? targetLeft : targetRight;
          intersectY = startY + slope * (intersectX - startX);
          if (intersectY < targetTop || intersectY > targetBottom) {
            // Если выходит за верхнюю или нижнюю границу, корректируем
            intersectY = dy > 0 ? targetBottom : targetTop;
            intersectX = startX + (intersectY - startY) / slope;
          }
        } else {
          // Пересечение с верхней или нижней стороной
          intersectY = dy > 0 ? targetTop : targetBottom;
          intersectX = startX + (intersectY - startY) / slope;
          if (intersectX < targetLeft || intersectX > targetRight) {
            // Если выходит за левую или правую границу, корректируем
            intersectX = dx > 0 ? targetLeft : targetRight;
            intersectY = startY + slope * (intersectX - startX);
          }
        }

        // Корректируем конечную точку
        endX = intersectX;
        endY = intersectY;

        // Параметры стрелки
        const arrowLength = 20 / scale;
        const arrowWidth = Math.PI / 6;

        // Рисуем стрелку
        ctx.beginPath();
        ctx.moveTo(endX, endY);
        ctx.lineTo(
          endX - arrowLength * Math.cos(angle - arrowWidth),
          endY - arrowLength * Math.sin(angle - arrowWidth)
        );
        ctx.lineTo(
          endX - arrowLength * Math.cos(angle + arrowWidth),
          endY - arrowLength * Math.sin(angle + arrowWidth)
        );
        ctx.closePath();
        ctx.fill();
      }
    });

    const buffer = canvas.toBuffer("image/png");
    res.set("Content-Type", "image/png");
    res.send(buffer);
  } catch (error) {
    console.error("Ошибка экспорта изображения:", error);
    res.status(500).json({
      error: "Ошибка при генерации изображения",
      details: error.message,
    });
  }
});
function getEdgeColor(edge) {
  return "#555";
}

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "visualizer",
    timestamp: new Date().toISOString(),
  });
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`Сервис визуализации запущен на порту ${PORT}`);
});
