package main

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

var scriptByExecutable = map[string]string{
	"ai-pdlc":     filepath.Join("src", "bin", "ai-pdlc.mjs"),
	"ai-pdlc-mcp": filepath.Join("src", "bin", "ai-pdlc-mcp.mjs"),
}

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err.Error())
		os.Exit(1)
	}
}

func run() error {
	executablePath, err := os.Executable()
	if err != nil {
		return fmt.Errorf("failed to resolve launcher path: %w", err)
	}

	executableName := strings.TrimSuffix(strings.ToLower(filepath.Base(executablePath)), filepath.Ext(executablePath))
	scriptRelativePath, ok := scriptByExecutable[executableName]
	if !ok {
		return fmt.Errorf("unsupported launcher name %q", executableName)
	}

	packageRoot := filepath.Dir(filepath.Dir(executablePath))
	scriptAbsolutePath := filepath.Join(packageRoot, scriptRelativePath)
	if _, err := os.Stat(scriptAbsolutePath); err != nil {
		return fmt.Errorf("failed to locate bundled script %q: %w", scriptAbsolutePath, err)
	}

	nodePath, err := resolveNodePath()
	if err != nil {
		return err
	}

	command := exec.Command(nodePath, append([]string{scriptAbsolutePath}, os.Args[1:]...)...)
	command.Stdin = os.Stdin
	command.Stdout = os.Stdout
	command.Stderr = os.Stderr
	command.Dir = packageRoot

	if err := command.Run(); err != nil {
		var exitError *exec.ExitError
		if errors.As(err, &exitError) {
			os.Exit(exitError.ExitCode())
		}
		return fmt.Errorf("failed to launch Node entrypoint: %w", err)
	}

	return nil
}

func resolveNodePath() (string, error) {
	for _, candidate := range []string{"node.exe", "node"} {
		if nodePath, err := exec.LookPath(candidate); err == nil {
			return nodePath, nil
		}
	}

	return "", errors.New("could not find node on PATH; install Node.js LTS or ensure node.exe is available")
}
