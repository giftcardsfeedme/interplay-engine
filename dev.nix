{ pkgs ? import <nixpkgs> { } }:

pkgs.mkShell {
  buildInputs = [
    pkgs.nodejs_20
    pkgs.nodePackages.npm
  ];

  shellHook = ''
    echo "Entering Nix shell..."
    PS1="[nix-shell:\w]$ "
  '';

  # Recommended VS Code extensions
  # To use them, open VS Code from the terminal with `code .`
  # and allow the recommended extensions to be installed.
  with pkgs.vscode-extensions;
  vscode.extensions = [
    # General productivity
    vscodevim.vim
    github.copilot
    esbenp.prettier-vscode
    dbaeumer.vscode-eslint

    # Web development
    ms-vscode.live-server
    ritwickdey.liveserver
    wix.vscode-import-cost
    bradlc.vscode-tailwindcss

    # Docker and remote development
    ms-azuretools.vscode-docker
    ms-vscode-remote.remote-containers
  ];
}
