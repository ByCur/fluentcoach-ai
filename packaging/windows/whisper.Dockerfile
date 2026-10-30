FROM debian:bookworm-20250908-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl cmake g++ make git && rm -rf /var/lib/apt/lists/*
# Upstream v1.9.5, pinned to its source commit. No CPU-specific instructions.
RUN curl -fL https://github.com/ggml-org/whisper.cpp/archive/d1be6fde11ac6e0407606b4e42fe72d34add8037.tar.gz | tar xz -C /opt \
    && mv /opt/whisper.cpp-* /opt/whisper
WORKDIR /opt/whisper
RUN cmake -B build -DCMAKE_BUILD_TYPE=Release -DGGML_NATIVE=OFF -DWHISPER_BUILD_TESTS=OFF -DBUILD_SHARED_LIBS=OFF \
    && cmake --build build --config Release --target whisper-server -j 2

FROM debian:bookworm-20250908-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl ffmpeg libgomp1 && rm -rf /var/lib/apt/lists/* \
    && useradd --uid 1000 --create-home whisper && mkdir /models && chown whisper /models
COPY --from=build /opt/whisper/build/bin/whisper-server /usr/local/bin/whisper-server
COPY --from=build /opt/whisper/models/download-ggml-model.sh /usr/local/bin/download-model
COPY --from=build /opt/whisper/examples/server/public /opt/public
USER whisper
WORKDIR /tmp
CMD ["whisper-server", "-m", "/models/ggml-base.bin", "--host", "0.0.0.0", "--port", "8080", "--public", "/opt/public", "--convert", "-l", "auto", "-nt"]
