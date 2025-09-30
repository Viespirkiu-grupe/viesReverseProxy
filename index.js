import express from "express";
import dotenv from "dotenv";
import { Readable } from "node:stream";

dotenv.config({ quiet: true });

const app = express();
const PORT = process.env.PROXY_PORT || 4000;
const MAIN_SERVER = process.env.MAIN_SERVER; // e.g. http://localhost:3000
const API_KEY = process.env.PROXY_API_KEY; // the same one stored in DB

if (!MAIN_SERVER || !API_KEY) {
    console.error("MAIN_SERVER and PROXY_API_KEY must be set in .env");
    process.exit(1);
}

app.get(["/:id", "/:dokId/:fileId"], async (req, res) => {
    const { id, dokId, fileId } = req.params;

    let requestedId = Number(id);
    if (dokId && fileId) {
        requestedId = `${Number(dokId)}/${Number(fileId)}`;
    }
    try {
        // Step 1: Ask main server for proxy info
        const infoRes = await fetch(
            `${MAIN_SERVER}/failas/${requestedId}/downloadProxyInformation`,
            {
                headers: {
                    Authorization: `Bearer ${API_KEY}`,
                },
            },
        );

        if (!infoRes.ok) {
            res.status(infoRes.status);
            return res.send(await infoRes.text());
        }

        const info = await infoRes.json();

        // Step 2: Request actual file (streaming, no buffering)
        const fileRes = await fetch(info.fileUrl, {
            headers: info.headers || {},
        });

        if (!fileRes.ok) {
            res.status(fileRes.status);
            return res.send(await fileRes.text());
        }

        // Step 3: Forward headers
        if (info.contentType) {
            res.setHeader("Content-Type", info.contentType);
        }
        if (info.contentLength) {
            res.setHeader("Content-Length", info.contentLength);
        }
        if (info.fileName) {
            res.setHeader(
                "Content-Disposition",
                `inline; filename="${encodeURIComponent(info.fileName)}"`,
            );
        }

        // Step 4: Pipe stream directly
        const stream = Readable.from(fileRes.body);

        stream.on("error", (err) => {
            console.error("Stream error:", err);
            res.destroy(err);
        });

        stream.pipe(res);
    } catch (err) {
        console.error("Proxy error:", err);
        res.status(500).send("Internal proxy error");
    }
});

app.listen(PORT, () => {
    console.log(`Proxy server listening on port ${PORT}`);
});
