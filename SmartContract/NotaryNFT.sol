// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract NotaryNFT is ERC721URIStorage, Ownable {
    uint256 public nextId = 1;

    mapping(bytes32 => uint256) public fileHashToToken;
    mapping(bytes32 => uint256) public metaHashToToken;
    mapping(uint256 => bool) public isPublicToken;

    event Minted(
        uint256 indexed tokenId,
        bytes32 indexed docHash,
        bytes32 indexed metaHash,
        bool isPublic,
        string tokenURI
    );

    event Revealed(uint256 indexed tokenId, string tokenURI);

    constructor(string memory name_, string memory symbol_) ERC721(name_, symbol_) Ownable(msg.sender) {}

    function mint(
        bytes32 docHash,
        bytes32 metaHash,
        bool makePublic,
        string calldata uri // pass "" when private or when pinning will happen later
    ) external returns (uint256 tokenId) {
        require(docHash != bytes32(0), "docHash required");
        require(fileHashToToken[docHash] == 0, "already minted");
        require(metaHash != bytes32(0), "metaHash required");

        tokenId = nextId++;
        _safeMint(msg.sender, tokenId);

        fileHashToToken[docHash] = tokenId;
        metaHashToToken[metaHash] = tokenId;

        if (makePublic && bytes(uri).length > 0) {
            _setTokenURI(tokenId, uri);
            isPublicToken[tokenId] = true;
        }

        emit Minted(tokenId, docHash, metaHash, makePublic && bytes(uri).length > 0, uri);
    }

    function reveal(uint256 tokenId, string calldata uri) external {
        require(_ownerOf(tokenId) == msg.sender, "not owner");
        require(!isPublicToken[tokenId], "already public");
        require(bytes(uri).length > 0, "uri required");

        _setTokenURI(tokenId, uri);
        isPublicToken[tokenId] = true;

        emit Revealed(tokenId, uri);
    }

    // Reverse lookups (view):
    function getTokenByFileHash(bytes32 docHash) external view returns (uint256) {
        return fileHashToToken[docHash];
    }

    function getTokenByMetaHash(bytes32 metaHash) external view returns (uint256) {
        return metaHashToToken[metaHash];
    }
}
