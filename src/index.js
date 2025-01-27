import express from "express";
import path from "path";
import { ModelManagerUtil } from "./modelManager.js";
import { fileURLToPath } from "url";
import { dirname } from "path";

const app = express();
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Standard error response format for DocuSign
const createErrorResponse = (status, code, message, details = null) => {
  const response = {
    error: code,
    message: message,
  };
  if (details) {
    response.details = details;
  }
  return response;
};

// Initialize model manager
const MODEL_MANAGER = ModelManagerUtil.createModelManagerFromCTO(
  path.join(__dirname, "./model.cto")
);
const CONCEPTS = MODEL_MANAGER.getConceptDeclarations();
const READABLE_CONCEPTS = CONCEPTS.filter((concept) =>
  concept
    .getDecorator("Crud")
    ?.getArguments()[0]
    ?.split(",")
    .includes("Readable")
);

// Middleware to validate authorization
const validateAuth = (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth) {
    return res
      .status(401)
      .json(
        createErrorResponse(401, "UNAUTHORIZED", "Missing authorization header")
      );
  }
  req.webexToken = auth.replace(/^Bearer\s+/i, "");
  next();
};

// Transform meeting request for Webex API
const transformMeetingRequest = (docusignRequest) => {
  if (!docusignRequest.email1 || !docusignRequest.email2) {
    throw new Error("Missing required email fields");
  }

  return {
    title: "DocuSign Generated Meeting",
    start: new Date().toISOString(),
    end: new Date(Date.now() + 3600000).toISOString(), // 1 hour meeting
    invitees: [
      { email: docusignRequest.email1 },
      { email: docusignRequest.email2 },
    ],
  };
};

// GetTypeNames
app.post("/api/types/names", async (req, res) => {
  try {
    const typeNames = [{ typeName: "Meeting", label: "Meeting" }];
    res.json({ typeNames });
  } catch (error) {
    res
      .status(500)
      .json(
        createErrorResponse(
          500,
          "INTERNAL_ERROR",
          "Failed to retrieve type names",
          error.message
        )
      );
  }
});

// GetTypeDefinitions
app.post("/api/types/definitions", async (req, res) => {
  const { typeNames } = req.body;

  if (!typeNames || !Array.isArray(typeNames)) {
    return res
      .status(400)
      .json(
        createErrorResponse(
          400,
          "BAD_REQUEST",
          "Missing or invalid typeNames in request"
        )
      );
  }

  try {
    const declarations = READABLE_CONCEPTS.filter((concept) =>
      typeNames.includes(concept.getName())
    ).map((concept) => concept.ast);

    return res.json({ declarations });
  } catch (error) {
    return res
      .status(500)
      .json(
        createErrorResponse(
          500,
          "INTERNAL_ERROR",
          "Failed to get type definitions",
          error.message
        )
      );
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

// Create a meeting
app.post("/api/webex/create", validateAuth, async (req, res) => {
  const {
    body: { data, typeName },
  } = req;

  try {
    if (!data || !typeName) {
      return res
        .status(400)
        .json(
          createErrorResponse(
            400,
            "BAD_REQUEST",
            "data or typeName missing in request"
          )
        );
    }

    const webexRequest = transformMeetingRequest(data);

    const response = await fetch("https://webexapis.com/v1/meetings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${req.webexToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(webexRequest),
    });
    console.log(response);
    if (!response.ok) {
      throw new Error(`Webex API error: ${response.statusText}`);
    }

    const result = await response.json();

    return res.json({
      recordId: result.id,
      meetingLink: result.webLink,
    });
  } catch (error) {
    console.log(error);
    return res
      .status(error.response?.status === 401 ? 401 : 500)
      .json(
        createErrorResponse(
          error.response?.status === 401 ? 401 : 500,
          error.response?.status === 401 ? "UNAUTHORIZED" : "INTERNAL_ERROR",
          "Failed to create meeting",
          error.message
        )
      );
  }
});

// List meetings
app.post("/api/webex/list", validateAuth, async (req, res) => {
  const {
    body: { query, pagination },
  } = req;

  try {
    if (!query || !pagination) {
      return res
        .status(400)
        .json(
          createErrorResponse(
            400,
            "BAD_REQUEST",
            "Query or pagination missing in request"
          )
        );
    }

    const response = await fetch("https://webexapis.com/v1/meetings", {
      headers: {
        Authorization: `Bearer ${req.webexToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Webex API error: ${response.statusText}`);
    }

    const result = await response.json();

    const records = result.items.map((meeting) => ({
      id: meeting.id,
      title: meeting.title,
      start: meeting.start,
      end: meeting.end,
      webLink: meeting.webLink,
    }));

    return res.json({
      records,
    });
  } catch (error) {
    return res
      .status(error.response?.status === 401 ? 401 : 500)
      .json(
        createErrorResponse(
          error.response?.status === 401 ? 401 : 500,
          error.response?.status === 401 ? "UNAUTHORIZED" : "INTERNAL_ERROR",
          "Failed to list meetings",
          error.message
        )
      );
  }
});

// Update meeting (empty endpoint)
app.patch("/api/webex/update", validateAuth, async (req, res) => {
  res.status(200).json({ success: true });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error("Unhandled error:", error);
  res
    .status(500)
    .json(
      createErrorResponse(
        500,
        "INTERNAL_ERROR",
        "An unexpected error occurred",
        error.message
      )
    );
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API Proxy running on port ${PORT}`);
});
