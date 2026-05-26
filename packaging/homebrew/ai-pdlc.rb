class AiPdlc < Formula
  desc "AI-PDLC CLI, Codex skill bundle, and local MCP server"
  homepage "https://github.com/bugtsa/ai-pdlc"
  url "https://github.com/bugtsa/ai-pdlc/releases/download/v0.1.0/ai-pdlc-0.1.0.tgz"
  sha256 "a9aac76332e2782a7857d47e93bb9c62f0fb513faaf09c0472cb20078a73eca8"
  license :cannot_represent

  depends_on "node" => :runtime

  def install
    system "npm", "install", *std_npm_args

    package_root = libexec/"lib/node_modules/ai-pdlc"
    pkgshare.install package_root/"claude-desktop"
    pkgshare.install package_root/"skills"
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
