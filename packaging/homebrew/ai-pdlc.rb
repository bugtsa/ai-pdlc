class AiPdlc < Formula
  desc "AI-PDLC CLI, Codex skill bundle, and local MCP server"
  homepage "https://github.com/REPLACE_ME/ai-pdlc"
  url "https://github.com/REPLACE_ME/ai-pdlc/releases/download/v0.1.0/ai-pdlc-0.1.0.tar.gz"
  sha256 "REPLACE_WITH_RELEASE_SHA256"
  license "MIT"

  depends_on "node" => :runtime

  def install
    libexec.install Dir["*"]
    bin.write_exec_script libexec/"src/bin/ai-pdlc.mjs"
    bin.write_exec_script libexec/"src/bin/ai-pdlc-mcp.mjs"
    pkgshare.install "claude-desktop"
    pkgshare.install "skills"
  end

  def caveats
    <<~EOS
      Finish client setup with one of:

        ai-pdlc setup-codex --repo-root /path/to/repo
        ai-pdlc setup-claude-code --repo-root /path/to/repo
    EOS
  end

  test do
    assert_match "setup-codex", shell_output("#{bin}/ai-pdlc help")
  end
end
